import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, parseUnits, type Address } from "viem";
import { getClient } from "../../clients.js";
import { MORPHO_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { morphoAbi } from "../../abis/morpho.js";
import { erc20Abi } from "../../abis/erc20.js";
import { getBestQuote } from "./swap-utils.js";

// ─── Tool ────────────────────────────────────────────────────────────────────

const inputSchema = {
  marketId: z
    .string()
    .describe("Morpho market ID (bytes32 hex string). Use list_morpho_markets to discover IDs."),
  amount: z
    .string()
    .describe("Initial collateral amount in human-readable units (e.g. '10' for 10 weETH)"),
  loops: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .describe("Number of loop iterations (1-10, default 5)"),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerAnalyzeLoop(server: McpServer) {
  server.registerTool(
    "analyze_loop_strategy",
    {
      description:
        "Analyze a Morpho looping strategy with real Sushi swap slippage. Given a market and collateral amount, simulates N loop iterations (supply → borrow → swap → supply) and the full unwind. Uses QuoterV2 for real price impact at each step. Returns per-loop breakdown, unwind analysis, and total slippage cost.",
      inputSchema,
    },
    async ({ marketId, amount, loops, network }) => {
      const net = network as NetworkName;
      const client = getClient(net);
      const morpho = MORPHO_CONTRACTS.mainnet.morpho;
      const id = marketId as `0x${string}`;

      // ── 1. Fetch market params and state ───────────────────────────
      const [params, state] = await Promise.all([
        client.readContract({
          address: morpho,
          abi: morphoAbi,
          functionName: "idToMarketParams",
          args: [id],
        }),
        client.readContract({
          address: morpho,
          abi: morphoAbi,
          functionName: "market",
          args: [id],
        }),
      ]);

      const collateralAddr = params.collateralToken as Address;
      const loanAddr = params.loanToken as Address;
      const lltv = params.lltv as bigint;
      const lltvNum = Number(lltv) / 1e18;

      // Fetch token metadata
      const [collSym, collDec, loanSym, loanDec] = await Promise.all([
        client.readContract({ address: collateralAddr, abi: erc20Abi, functionName: "symbol" }).catch(() => "???"),
        client.readContract({ address: collateralAddr, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
        client.readContract({ address: loanAddr, abi: erc20Abi, functionName: "symbol" }).catch(() => "???"),
        client.readContract({ address: loanAddr, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
      ]);

      const collSymbol = collSym as string;
      const collDecimals = collDec as number;
      const loanSymbol = loanSym as string;
      const loanDecimals = loanDec as number;

      const totalSupply = state[0] as bigint;
      const totalBorrow = state[2] as bigint;
      const availableBorrow = totalSupply - totalBorrow;

      // ── 2. Get unit prices from Sushi (small amount for zero-impact baseline) ──
      const unitAmountLoan = parseUnits("0.01", loanDecimals);
      const unitAmountColl = parseUnits("0.01", collDecimals);

      const [unitQuoteLoop, unitQuoteUnwind] = await Promise.all([
        getBestQuote(client, loanAddr, collateralAddr, unitAmountLoan),
        getBestQuote(client, collateralAddr, loanAddr, unitAmountColl),
      ]);

      if (!unitQuoteLoop || !unitQuoteUnwind) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: `No Sushi liquidity found for ${collSymbol}/${loanSymbol}. Cannot analyze loop strategy.`,
              market: { collateral: collSymbol, loan: loanSymbol, lltv: `${(lltvNum * 100).toFixed(2)}%` },
            }, null, 2),
          }],
          isError: true,
        };
      }

      // Unit rate: how much collateral per 1 loan token (and vice versa)
      // Using 0.01 unit, so multiply by 100
      const unitRateLoopNum = Number(unitQuoteLoop.amountOut) / Number(unitAmountLoan) * (10 ** loanDecimals / 10 ** collDecimals);
      const unitRateUnwindNum = Number(unitQuoteUnwind.amountOut) / Number(unitAmountColl) * (10 ** collDecimals / 10 ** loanDecimals);

      // ── 3. Simulate loop iterations ────────────────────────────────
      const initialCollateralWei = parseUnits(amount, collDecimals);
      let currentCollateralWei = initialCollateralWei;
      let cumulativeCollateralWei = initialCollateralWei;
      let cumulativeDebtWei = 0n;
      let remainingBorrow = availableBorrow;

      const loopSteps: Array<Record<string, string | number>> = [];
      const collateralPerLoop: bigint[] = []; // track each loop's collateral for unwind

      for (let i = 0; i < loops; i++) {
        // Convert current collateral to loan token value using unit price
        // borrowAmount = collateralAmount * unitRateUnwind * LLTV
        const collateralInLoanTerms = BigInt(
          Math.floor(
            Number(currentCollateralWei) * unitRateUnwindNum * (10 ** loanDecimals / 10 ** collDecimals)
          )
        );
        const borrowAmountWei = (collateralInLoanTerms * lltv) / (10n ** 18n);

        // Check borrow capacity
        if (borrowAmountWei > remainingBorrow) {
          loopSteps.push({
            loop: i + 1,
            status: "STOPPED — insufficient borrow liquidity",
            requestedBorrow: formatUnits(borrowAmountWei, loanDecimals),
            availableBorrow: formatUnits(remainingBorrow, loanDecimals),
          });
          break;
        }

        // Get real Sushi quote for swapping borrowed loan → collateral
        const swapQuote = await getBestQuote(client, loanAddr, collateralAddr, borrowAmountWei);

        if (!swapQuote) {
          loopSteps.push({
            loop: i + 1,
            status: "STOPPED — no Sushi quote available for this amount",
            borrowAmount: formatUnits(borrowAmountWei, loanDecimals),
          });
          break;
        }

        // Calculate slippage vs unit price
        const expectedOut = Number(borrowAmountWei) * unitRateLoopNum * (10 ** collDecimals / 10 ** loanDecimals);
        const actualOut = Number(swapQuote.amountOut);
        const slippagePct = expectedOut > 0 ? ((expectedOut - actualOut) / expectedOut) * 100 : 0;

        cumulativeDebtWei += borrowAmountWei;
        cumulativeCollateralWei += swapQuote.amountOut;
        remainingBorrow -= borrowAmountWei;
        currentCollateralWei = swapQuote.amountOut;
        collateralPerLoop.push(swapQuote.amountOut);

        const leverage = Number(cumulativeCollateralWei) / Number(initialCollateralWei);
        const healthFactor = cumulativeDebtWei > 0n
          ? (Number(cumulativeCollateralWei) * unitRateUnwindNum * (10 ** loanDecimals / 10 ** collDecimals) * lltvNum) / Number(cumulativeDebtWei)
          : Infinity;

        loopSteps.push({
          loop: i + 1,
          collateralAdded: `${formatUnits(swapQuote.amountOut, collDecimals)} ${collSymbol}`,
          borrowed: `${formatUnits(borrowAmountWei, loanDecimals)} ${loanSymbol}`,
          swapOutput: `${formatUnits(swapQuote.amountOut, collDecimals)} ${collSymbol}`,
          swapRoute: swapQuote.source,
          slippage: `${slippagePct.toFixed(4)}%`,
          cumulativeCollateral: `${formatUnits(cumulativeCollateralWei, collDecimals)} ${collSymbol}`,
          cumulativeDebt: `${formatUnits(cumulativeDebtWei, loanDecimals)} ${loanSymbol}`,
          leverage: `${leverage.toFixed(2)}x`,
          healthFactor: healthFactor === Infinity ? "∞" : healthFactor.toFixed(4),
          availableBorrowRemaining: `${formatUnits(remainingBorrow, loanDecimals)} ${loanSymbol}`,
        });
      }

      // ── 4. Simulate unwind (reverse order) ─────────────────────────
      let remainingDebtWei = cumulativeDebtWei;
      const unwindSteps: Array<Record<string, string | number>> = [];

      for (let i = collateralPerLoop.length - 1; i >= 0; i--) {
        const collToSell = collateralPerLoop[i];

        const unwindQuote = await getBestQuote(client, collateralAddr, loanAddr, collToSell);

        if (!unwindQuote) {
          unwindSteps.push({
            step: collateralPerLoop.length - i,
            status: "FAILED — no Sushi quote for unwind",
            collateralToSell: `${formatUnits(collToSell, collDecimals)} ${collSymbol}`,
          });
          continue;
        }

        const expectedLoan = Number(collToSell) * unitRateUnwindNum * (10 ** loanDecimals / 10 ** collDecimals);
        const actualLoan = Number(unwindQuote.amountOut);
        const slippagePct = expectedLoan > 0 ? ((expectedLoan - actualLoan) / expectedLoan) * 100 : 0;

        const repaid = unwindQuote.amountOut > remainingDebtWei ? remainingDebtWei : unwindQuote.amountOut;
        remainingDebtWei -= repaid;

        unwindSteps.push({
          step: collateralPerLoop.length - i,
          collateralWithdrawn: `${formatUnits(collToSell, collDecimals)} ${collSymbol}`,
          swapOutput: `${formatUnits(unwindQuote.amountOut, loanDecimals)} ${loanSymbol}`,
          swapRoute: unwindQuote.source,
          slippage: `${slippagePct.toFixed(4)}%`,
          debtRepaid: `${formatUnits(repaid, loanDecimals)} ${loanSymbol}`,
          remainingDebt: `${formatUnits(remainingDebtWei, loanDecimals)} ${loanSymbol}`,
        });
      }

      // ── 5. Summary ─────────────────────────────────────────────────
      const effectiveLeverage = Number(cumulativeCollateralWei) / Number(initialCollateralWei);

      // Calculate total slippage costs
      const totalLoopSlippage = loopSteps.reduce((sum, step) => {
        const s = typeof step.slippage === "string" ? parseFloat(step.slippage) : 0;
        return sum + (isNaN(s) ? 0 : s);
      }, 0);
      const totalUnwindSlippage = unwindSteps.reduce((sum, step) => {
        const s = typeof step.slippage === "string" ? parseFloat(step.slippage) : 0;
        return sum + (isNaN(s) ? 0 : s);
      }, 0);

      const finalHealthFactor = cumulativeDebtWei > 0n
        ? (Number(cumulativeCollateralWei) * unitRateUnwindNum * (10 ** loanDecimals / 10 ** collDecimals) * lltvNum) / Number(cumulativeDebtWei)
        : Infinity;

      const borrowUtilized = availableBorrow > 0n
        ? Number(cumulativeDebtWei) / Number(availableBorrow) * 100
        : 0;

      const unwindDebtShortfall = remainingDebtWei > 0n
        ? formatUnits(remainingDebtWei, loanDecimals)
        : "0";

      const response = {
        network,
        market: {
          id: marketId,
          collateral: { symbol: collSymbol, address: collateralAddr, decimals: collDecimals },
          loan: { symbol: loanSymbol, address: loanAddr, decimals: loanDecimals },
          lltv: `${(lltvNum * 100).toFixed(2)}%`,
          availableBorrow: `${formatUnits(availableBorrow, loanDecimals)} ${loanSymbol}`,
          totalSupply: `${formatUnits(totalSupply, loanDecimals)} ${loanSymbol}`,
          utilization: totalSupply > 0n
            ? `${(Number(totalBorrow * 10000n / totalSupply) / 100).toFixed(2)}%`
            : "0%",
        },
        sushiLiquidity: {
          loopDirection: `${loanSymbol} → ${collSymbol}`,
          bestRoute: unitQuoteLoop.source,
          unwindDirection: `${collSymbol} → ${loanSymbol}`,
          bestUnwindRoute: unitQuoteUnwind.source,
        },
        initialCollateral: `${amount} ${collSymbol}`,
        loopAnalysis: loopSteps,
        unwindAnalysis: unwindSteps,
        summary: {
          effectiveLeverage: `${effectiveLeverage.toFixed(2)}x`,
          totalCollateral: `${formatUnits(cumulativeCollateralWei, collDecimals)} ${collSymbol}`,
          totalDebt: `${formatUnits(cumulativeDebtWei, loanDecimals)} ${loanSymbol}`,
          finalHealthFactor: finalHealthFactor === Infinity ? "∞" : finalHealthFactor.toFixed(4),
          totalSlippageCostLoop: `${totalLoopSlippage.toFixed(4)}%`,
          totalSlippageCostUnwind: `${totalUnwindSlippage.toFixed(4)}%`,
          totalSlippageCostRoundtrip: `${(totalLoopSlippage + totalUnwindSlippage).toFixed(4)}%`,
          unwindDebtShortfall: `${unwindDebtShortfall} ${loanSymbol}`,
          availableBorrowUtilized: `${borrowUtilized.toFixed(2)}%`,
        },
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(response, null, 2) },
        ],
      };
    }
  );
}
