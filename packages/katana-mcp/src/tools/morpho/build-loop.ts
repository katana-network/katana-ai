import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  encodeFunctionData,
  encodeAbiParameters,
  keccak256,
  parseUnits,
  formatUnits,
  maxUint256,
  type Address,
  zeroHash,
} from "viem";
import { getClient } from "../../clients.js";
import {
  MORPHO_CONTRACTS,
  SUSHI_CONTRACTS,
  type NetworkName,
} from "../../config/contracts.js";
import { morphoAbi } from "../../abis/morpho.js";
import { erc20Abi } from "../../abis/erc20.js";
import { bundler3Abi, callComponents } from "../../abis/bundler3.js";
import { generalAdapter1Abi } from "../../abis/general-adapter1.js";
import { sushiV3RouterAbi } from "../../abis/sushi-v3-router.js";
import { getBestQuote } from "./swap-utils.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BundlerCall {
  to: Address;
  data: `0x${string}`;
  value: bigint;
  skipRevert: boolean;
  callbackHash: `0x${string}`;
}

// ─── Tool ────────────────────────────────────────────────────────────────────

const inputSchema = {
  marketId: z
    .string()
    .describe(
      "Morpho market ID (bytes32 hex string). Use list_morpho_markets to discover IDs."
    ),
  userAddress: z.string().describe("Wallet address that will execute the loop"),
  amount: z
    .string()
    .describe(
      "Initial collateral amount in human-readable units (e.g. '10' for 10 WETH)"
    ),
  targetLeverage: z
    .coerce.number()
    .min(1.1)
    .max(20)
    .describe(
      "Target leverage multiplier (e.g. 3.0 for 3x). Must be safely below max leverage."
    ),
  maxSlippageBps: z
    .coerce.number()
    .int()
    .min(1)
    .max(1000)
    .default(100)
    .describe("Max slippage in basis points (default 100 = 1%)"),
  swapFeeTier: z
    .coerce.number()
    .int()
    .default(3000)
    .describe("Sushi V3 fee tier for the swap (default 3000 = 0.3%)"),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerBuildLoop(server: McpServer) {
  server.registerTool(
    "build_morpho_loop",
    {
      description:
        "Build an atomic leveraged loop transaction using Morpho flashloans + Bundler3. Executes supply → flashloan → swap → supply collateral → borrow in a single transaction. Returns unsigned Bundler3.multicall tx data, prerequisite checks, and position summary. Requires build_morpho_authorize first. NOTE: This tool makes several on-chain reads (market params, token metadata, swap quotes, prerequisite checks) and may take 10-20 seconds to complete. If it times out, try again — the RPC can be slow under load.",
      inputSchema,
    },
    async ({
      marketId,
      userAddress,
      amount,
      targetLeverage,
      maxSlippageBps,
      swapFeeTier,
      network,
    }) => {
      const net = network as NetworkName;
      const client = getClient(net);
      const morpho = MORPHO_CONTRACTS.mainnet.morpho;
      const bundler3 = MORPHO_CONTRACTS.mainnet.bundler3;
      const adapter = MORPHO_CONTRACTS.mainnet.generalAdapter1;
      const sushiRouter = SUSHI_CONTRACTS.mainnet.v3SwapRouter;
      const user = userAddress as Address;
      const id = marketId as `0x${string}`;

      // ── 1. Fetch market params + token metadata in one batch ─────
      const params = await client.readContract({
        address: morpho,
        abi: morphoAbi,
        functionName: "idToMarketParams",
        args: [id],
      });

      const collateralToken = params.collateralToken as Address;
      const loanToken = params.loanToken as Address;
      const lltv = params.lltv as bigint;
      const lltvNum = Number(lltv) / 1e18;

      // Max safe leverage = 1 / (1 - LLTV) * 0.95 safety margin
      const maxSafeLeverage = (1 / (1 - lltvNum)) * 0.95;
      if (targetLeverage > maxSafeLeverage) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: `Target leverage ${targetLeverage}x exceeds max safe leverage ${maxSafeLeverage.toFixed(2)}x for LLTV ${(lltvNum * 100).toFixed(2)}%`,
                  suggestion: `Use a leverage <= ${maxSafeLeverage.toFixed(2)}x or choose a market with higher LLTV.`,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      // ── 2. Batch token metadata + prerequisites in one round-trip ─
      const [collSym, collDec, loanSym, loanDec, isAuthorized, collateralAllowance] = await Promise.all([
        client
          .readContract({ address: collateralToken, abi: erc20Abi, functionName: "symbol" })
          .catch(() => "???"),
        client
          .readContract({ address: collateralToken, abi: erc20Abi, functionName: "decimals" })
          .catch(() => 18),
        client
          .readContract({ address: loanToken, abi: erc20Abi, functionName: "symbol" })
          .catch(() => "???"),
        client
          .readContract({ address: loanToken, abi: erc20Abi, functionName: "decimals" })
          .catch(() => 18),
        client.readContract({
          address: morpho,
          abi: morphoAbi,
          functionName: "isAuthorized",
          args: [user, adapter],
        }),
        client.readContract({
          address: collateralToken,
          abi: erc20Abi,
          functionName: "allowance",
          args: [user, bundler3],
        }),
      ]);

      const collSymbol = collSym as string;
      const collDecimals = collDec as number;
      const loanSymbol = loanSym as string;
      const loanDecimals = loanDec as number;

      const initialCollateralWei = parseUnits(amount, collDecimals);

      // ── 3. Get swap quote to calculate flash amount ───────────────
      // We need: how much collateral do we get per unit of loan token?
      // Flash amount = initialCollateral * (leverage - 1) / swapRate
      const probeAmount = parseUnits("1", loanDecimals);
      const probeQuote = await getBestQuote(
        client,
        loanToken,
        collateralToken,
        probeAmount
      );

      if (!probeQuote) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: `No Sushi liquidity found for ${loanSymbol} → ${collSymbol}. Cannot build loop.`,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      // swapRate = collateral per 1 loan token (in wei-adjusted terms)
      const swapRateNum =
        (Number(probeQuote.amountOut) / 10 ** collDecimals) /
        (Number(probeAmount) / 10 ** loanDecimals);

      // flashAmount (in loan token units) = initialCollateral * (leverage - 1) / swapRate
      const initialCollNum = Number(initialCollateralWei) / 10 ** collDecimals;
      const flashAmountNum = (initialCollNum * (targetLeverage - 1)) / swapRateNum;
      const flashAmountWei = parseUnits(
        flashAmountNum.toFixed(loanDecimals),
        loanDecimals
      );

      // ── 4. Get real quote for the actual flash amount ─────────────
      const realQuote = await getBestQuote(
        client,
        loanToken,
        collateralToken,
        flashAmountWei
      );

      if (!realQuote) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: `No Sushi liquidity for flash amount ${formatUnits(flashAmountWei, loanDecimals)} ${loanSymbol}. Try lower leverage.`,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      // Calculate minimum output with slippage
      const minCollateralOut =
        (realQuote.amountOut * BigInt(10000 - maxSlippageBps)) / 10000n;

      // Total collateral = initial + swap output
      const totalCollateralWei = initialCollateralWei + realQuote.amountOut;
      const effectiveLeverage =
        Number(totalCollateralWei) / Number(initialCollateralWei);

      // ── 5. Check prerequisites (already fetched in batch above) ──
      const prerequisites: Array<{
        action: string;
        required: boolean;
        transaction?: { to: string; data: string; value: string };
      }> = [];

      if (!isAuthorized) {
        prerequisites.push({
          action: `Authorize GeneralAdapter1 on Morpho (one-time)`,
          required: true,
          transaction: {
            to: morpho,
            data: encodeFunctionData({
              abi: morphoAbi,
              functionName: "setAuthorization",
              args: [adapter, true],
            }),
            value: "0",
          },
        });
      }

      if ((collateralAllowance as bigint) < initialCollateralWei) {
        prerequisites.push({
          action: `Approve Bundler3 to spend ${amount} ${collSymbol}`,
          required: true,
          transaction: {
            to: collateralToken,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [bundler3, initialCollateralWei],
            }),
            value: "0",
          },
        });
      }

      // ── 6. Build the callback bundle (inside flashloan) ──────────
      const marketParamsTuple = {
        loanToken: params.loanToken,
        collateralToken: params.collateralToken,
        oracle: params.oracle,
        irm: params.irm,
        lltv: params.lltv,
      } as const;

      // Call_A: Move flash-loaned loan tokens from adapter to Bundler3
      const callA: BundlerCall = {
        to: adapter,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "erc20Transfer",
          args: [loanToken, bundler3, maxUint256],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      };

      // Call_B: Bundler3 approves Sushi router to pull loan tokens
      const callB: BundlerCall = {
        to: loanToken,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [sushiRouter, flashAmountWei],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      };

      // Call_C: Swap loan tokens → collateral via Sushi V3, output to adapter
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 min
      const callC: BundlerCall = {
        to: sushiRouter,
        data: encodeFunctionData({
          abi: sushiV3RouterAbi,
          functionName: "exactInputSingle",
          args: [
            {
              tokenIn: loanToken,
              tokenOut: collateralToken,
              fee: swapFeeTier,
              recipient: adapter,
              deadline,
              amountIn: flashAmountWei,
              amountOutMinimum: minCollateralOut,
              sqrtPriceLimitX96: 0n,
            },
          ],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      };

      // Call_D: Supply ALL collateral (initial + swapped) to Morpho on behalf of user
      const callD: BundlerCall = {
        to: adapter,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "morphoSupplyCollateral",
          args: [marketParamsTuple, maxUint256, user, "0x"],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      };

      // Call_E: Borrow flashAmount on behalf of user, send to adapter (for flash repayment)
      const callE: BundlerCall = {
        to: adapter,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "morphoBorrow",
          args: [marketParamsTuple, flashAmountWei, 0n, flashAmountWei, adapter],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      };

      const callbackCalls: BundlerCall[] = [callA, callB, callC, callD, callE];

      // ── 7. Encode callback data and hash ──────────────────────────
      const callbackData = encodeAbiParameters(
        [
          {
            type: "tuple[]",
            components: callComponents,
          },
        ],
        [
          callbackCalls.map((c) => ({
            to: c.to,
            data: c.data,
            value: c.value,
            skipRevert: c.skipRevert,
            callbackHash: c.callbackHash,
          })),
        ]
      );
      const callbackHash = keccak256(callbackData);

      // ── 8. Build outer bundle ─────────────────────────────────────

      // Call_0: Pull user's initial collateral into adapter
      const call0: BundlerCall = {
        to: adapter,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "erc20TransferFrom",
          args: [collateralToken, initialCollateralWei],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      };

      // Call_1: Flash loan — adapter borrows loan tokens, callback executes the loop
      const call1: BundlerCall = {
        to: adapter,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "morphoFlashLoan",
          args: [loanToken, flashAmountWei, callbackData],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash,
      };

      const outerCalls: BundlerCall[] = [call0, call1];

      // ── 9. Encode final multicall tx ──────────────────────────────
      const multicallData = encodeFunctionData({
        abi: bundler3Abi,
        functionName: "multicall",
        args: [
          outerCalls.map((c) => ({
            to: c.to,
            data: c.data,
            value: c.value,
            skipRevert: c.skipRevert,
            callbackHash: c.callbackHash,
          })),
        ],
      });

      // ── 10. Calculate health factor ───────────────────────────────
      // Get reverse quote: how much loan token is totalCollateral worth?
      const reverseProbe = parseUnits("1", collDecimals);
      const reverseQuote = await getBestQuote(
        client,
        collateralToken,
        loanToken,
        reverseProbe
      );

      let healthFactor = "N/A";
      if (reverseQuote) {
        const reverseRate =
          (Number(reverseQuote.amountOut) / 10 ** loanDecimals) /
          (Number(reverseProbe) / 10 ** collDecimals);
        const totalCollValue =
          (Number(totalCollateralWei) / 10 ** collDecimals) * reverseRate;
        const totalDebt = Number(flashAmountWei) / 10 ** loanDecimals;
        const hf = totalDebt > 0 ? (totalCollValue * lltvNum) / totalDebt : Infinity;
        healthFactor = hf === Infinity ? "∞" : hf.toFixed(4);
      }

      // ── 11. Build response ────────────────────────────────────────
      const response = {
        network,
        market: {
          id: marketId,
          collateral: {
            symbol: collSymbol,
            address: collateralToken,
            decimals: collDecimals,
          },
          loan: {
            symbol: loanSymbol,
            address: loanToken,
            decimals: loanDecimals,
          },
          lltv: `${(lltvNum * 100).toFixed(2)}%`,
          maxSafeLeverage: `${maxSafeLeverage.toFixed(2)}x`,
        },
        loop: {
          initialCollateral: `${amount} ${collSymbol}`,
          flashLoanAmount: `${formatUnits(flashAmountWei, loanDecimals)} ${loanSymbol}`,
          expectedSwapOutput: `${formatUnits(realQuote.amountOut, collDecimals)} ${collSymbol}`,
          minSwapOutput: `${formatUnits(minCollateralOut, collDecimals)} ${collSymbol}`,
          swapRoute: realQuote.source,
          slippageTolerance: `${maxSlippageBps / 100}%`,
        },
        position: {
          totalCollateral: `${formatUnits(totalCollateralWei, collDecimals)} ${collSymbol}`,
          totalDebt: `${formatUnits(flashAmountWei, loanDecimals)} ${loanSymbol}`,
          effectiveLeverage: `${effectiveLeverage.toFixed(2)}x`,
          healthFactor,
        },
        prerequisites: prerequisites.length > 0 ? prerequisites : "All prerequisites met",
        transaction: {
          to: bundler3,
          data: multicallData,
          value: "0",
          description: `Atomic ${effectiveLeverage.toFixed(1)}x leverage loop: supply ${amount} ${collSymbol}, flashloan ${formatUnits(flashAmountWei, loanDecimals)} ${loanSymbol}, swap → ${collSymbol}, supply collateral, borrow to repay`,
        },
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(response) },
        ],
      };
    }
  );
}
