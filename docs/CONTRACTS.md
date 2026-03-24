# Katana Contract Addresses Reference

## Network Info

| | Mainnet | Testnet (Bokuto) |
|---|---|---|
| Chain ID | 747474 | 737373 |
| RPC | https://rpc.katana.network/ | https://rpc-bokuto.katanarpc.com |
| RPC (Tenderly) | https://katana.gateway.tenderly.co/ | — |
| RPC (Conduit) | https://rpc.katanarpc.com/ | — |
| Explorer | https://katanascan.io/ | https://bokuto.katanascan.io/ |
| Bridge UI | https://bridge.katana.network/ | — |
| Faucet | — | https://faucet.katana.tools/ |
| Block Time | 1 second | 1 second |
| Gas Limit | 60M | 60M |
| Gas Model | EIP-1559 | EIP-1559 |

## Mainnet Token Addresses

| Asset | Address | Decimals | Origin |
|-------|---------|----------|--------|
| KAT | 0x7f1f4b4b29f5058fa32cc7a97141b8d7e5abdc2d | — | Native |
| WETH (vbETH) | 0xEE7D8BCFb72bC1880D0Cf19822eB0A2e6577aB62 | 18 | Vault Bridge |
| WBTC (vbWBTC) | 0x0913DA6Da4b42f538B445599b46Bb4622342Cf52 | 8 | Vault Bridge |
| USDC (vbUSDC) | 0x203A662b0BD271A6ed5a60EdFbd04bFce608FD36 | 6 | Vault Bridge |
| USDT (vbUSDT) | 0x2DCa96907fde857dd3D816880A0df407eeB2D2F2 | 6 | Vault Bridge |
| USDS (vbUSDS) | 0x62D6A123E8D19d06d68cf0d2294F9A3A0362c6b3 | 18 | Vault Bridge |
| AUSD | 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a | — | Native |
| jitoSOL | 0x6C16E26013f2431e8B2e1Ba7067ECCcad0Db6C52 | — | LayerZero |
| BTCK | 0xB0F70C0bD6FD87dbEb7C10dC692a2a6106817072 | — | Native |
| LBTC | 0xecAc9C5F704e954931349Da37F60E39f515c11c1 | — | CCIP |
| weETH | 0x9893989433e7a383Cb313953e4c2365107dc19a7 | — | Agglayer |
| wstETH | 0x7Fb4D0f51544F24F385a421Db6e7D4fC71Ad8e5C | — | Agglayer |
| MORPHO | 0x1e5eFCA3D0dB2c6d5C67a4491845c43253eB9e4e | — | Agglayer |
| POL | 0xb24e3035d1FCBC0E43CF3143C3Fd92E53df2009b | — | Agglayer |
| SUSHI | 0x17BFF452dae47e07CeA877Ff0E1aba17eB62b0aB | — | Agglayer |
| YFI | 0x476eaCd417cD65421bD34fca054377658BB5E02b | — | Agglayer |
| uSOL | 0x9B8Df6E244526ab5F6e6400d331DB28C8fdDdb55 | — | Universal |
| uSUI | 0xb0505e5a99abd03d94a1169e638B78EDfEd26ea4 | — | Universal |
| uADA | 0xa3A34A0D9A08CCDDB6Ed422Ac0A28a06731335aA | — | Universal |
| uXRP | 0x2615a94df961278DcbC41Fb0a54fEC5f10a693aE | — | Universal |

## Sushi DEX Contracts (Mainnet)

| Contract | Address |
|----------|---------|
| V2Factory | 0x72D111b4d6f31B38919ae39779f570b747d6Acd9 |
| V2Router | 0x69cC349932ae18ED406eeB917d79b9b3033fB68E |
| V3Factory | 0x203e8740894c8955cB8950759876d7E7E45E04c1 |
| V3PositionManager | 0x2659C6085D26144117D904C46B48B6d180393d27 |
| V3QuoterV2 | 0x92dea23ED1C683940fF1a2f8fE23FE98C5d3041c |
| V3SwapRouter | 0x4e1d81A3E627b9294532e990109e4c21d217376C |
| V3TickLens | 0x35DC3E13469E980c37b6F288BBb9822B1f9bD435 |
| V3Migrator | 0xB9C62d7a76aFB4049E416328d0FC3133629fF744 |
| RedSnwapper | 0xAC4c6e212A361c968F1725b4d055b47E63F80b75 |
| RouteProcessor7 (RP7) | 0x3Ced11c610556e5292fBC2e75D68c3899098C14C |

## Morpho Contracts (Mainnet)

| Contract | Address |
|----------|---------|
| Morpho | 0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc |
| MetaMorphoFactory | 0x1c8de6889acee12257899bfeaa2b7e534de32e16 |
| MetaMorphoV1_1Factory | 0xd3f39505d0c48AFED3549D625982FdC38Ea9904b |
| AdaptiveCurveIrm | 0x4F708C0ae7deD3d74736594C2109C2E3c065B428 |
| MorphoChainlinkOracleV2Factory | 0x7D047fB910Bc187C18C81a69E30Fa164f8c536eC |
| PublicAllocator | 0x39EB6Da5e88194C82B13491Df2e8B3E213eD2412 |
| PreLiquidationFactory | 0x678EB53A3bB79111263f47B84989d16D81c36D85 |
| UrdFactory | 0xB605Ae0D112c117638592ec4F78148e6322a7b7b |
| Bundler3 | 0xA8C5e23C9C0DF2b6fF716486c6bBEBB6661548C8 |
| GeneralAdapter1 | 0x916Aa175C36E845db45fF6DDB886AE437d403B61 |

## Bridge Contracts

### Agglayer Unified Bridge
| Contract | Address |
|----------|---------|
| Unified Bridge | 0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe |
| Bridge & Call | 0x64B20Eb25AEd030FD510EF93B9135278B152f6a6 |
| Katana NetworkId | 20 |
| EthMainnet NetworkId | 0 |

### Vault Bridge (on Ethereum Mainnet)
| Token | Address |
|-------|---------|
| vbETH | 0x2DC70fb75b88d2eB4715bc06E1595E6D97c34DFF |
| vbUSDC | 0x53E82ABbb12638F09d9e624578ccB666217a765e |
| vbUSDT | 0x6d4f9f9f8f0155509ecd6Ac6c544fF27999845CC |
| vbWBTC | 0x2C24B57e2CCd1f273045Af6A5f632504C432374F |
| vbUSDS | 0x3DD459dE96F9C28e3a343b831cbDC2B93c8C4855 |

### Native Converters
| Token | Address |
|-------|---------|
| WETH | 0xa6b0db1293144ebe9478b6a84f75dd651e45914a |
| vbUSDC | 0x97a3500083348A147F419b8a65717909762c389f |
| vbUSDT | 0x053FA9b934b83E1E0ffc7e98a41aAdc3640bB462 |
| vbWBTC | 0xb00aa68b87256E2F22058fB2Ba3246EEc54A44fc |
| vbUSDS | 0x639f13D5f30B47c792b6851238c05D0b623C77DE |

### Chainlink CCIP
| Item | Address |
|------|---------|
| Katana Router | 0x7c19b79D2a054114Ab36ad758A36e92376e267DA |
| Ethereum Router | 0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D |

### LayerZero
| Config | Value |
|--------|-------|
| chainKey | katana |
| EID | 30375 |
| endpointV2 | 0x6F475642a6e85809B1c36Fa62763669b1b48DD5B |

## Common Infrastructure (Mainnet)

| Contract | Address |
|----------|---------|
| Multicall3 | 0xcA11bde05977b3631167028862bE2a173976CA11 |
| Permit2 | 0x000000000022D473030F116dDEE9F6B43aC78BA3 |
| GnosisSafe | 0x69f4D1788e39c87893C980c06EdF4b7f686e2938 |
| CreateX | 0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed |
| EntryPoint (ERC-4337 v0.8.0) | 0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108 |

## Price Feeds
- **Chainlink VerifierProxy:** 0x2a644E5AC685112A7Eff0c4d73CD0260546D366F
- **Redstone:** via Redstone On-chain Feeds
- **API3 Market:** https://market.api3.org/katana

## Testnet (Bokuto) Token Addresses

### On Sepolia
| Asset | Address |
|-------|---------|
| WETH | 0x04d08c8525B55c409201289C4ff5a204fa437d9f |
| WBTC | 0x8dbBbF4E801774265171D7e101a9f346Fa6f56bD |
| USDC | 0xCea1D25a715eC34adFB2267ACe127e8D107778dd |
| USDT | 0xDA9E6CAA9F85aE060BCcd6a789E0C7D39A33e24f |
| USDS | 0x5956982345967Dbc9648cD133c2fECb1eF132AE6 |

### On Bokuto (Katana Testnet)
| Asset | Address |
|-------|---------|
| WETH (vbETH) | 0x84b3493fA9B125A8EFf1CCc1328Bd84D0B4a2Dbf |
| WBTC (vbWBTC) | 0xe8255B44634b478aB10a649c6C207A654473dbed |
| USDC (vbUSDC) | 0xc2a4C310F2512A17Ac0047cf871aCAed3E62bB4B |
| USDT (vbUSDT) | 0xf6801557e17131Da48Fd03B2c34172872F936345 |
| USDS (vbUSDS) | 0x801f719178d9b85D4948ed146C50596273885a75 |

### Bokuto Bridge
| Item | Value |
|------|-------|
| Unified Bridge | 0x528e26b25a34a4A5d0dbDa1d57D318153d2ED582 |
| Bridge Service API | https://rpc-bridge-bokuto.katanarpc.com/ |
| Agglayer NetworkId | 37 |

## Governance

### Katana Admin (3-of-5 Multisig)
- Address: 0xd512543315c95506E4209805b888414EEF15C8C4
- 10-day timelock on all upgrades

### DeFi Security Council (10-of-13 Multisig)
- Address: 0x03105070424FbA70E4FC37A674eB70eD5190F9A0
- Veto power + emergency execution
- Members: Katana Foundation, Polygon Labs, Agora, Universal, Lombard, Sushi, Yearn, GSR, Gauntlet, Stakehouse, Bitvault, Re7
