# gapfee-data

Public feed of the fee decisions made by Margin, the agent that prices GapFee pools
(Uniswap v4 pools pairing tokenized stocks with USDG on Robinhood Chain).

- `latest/index.json`: one entry per pool with the current fee.
- `latest/<poolId>.json`: the full record for a pool: fee, LP/treasury split, the reason, the
  signed update (when live), what the hook currently has on-chain, and the inputs the decision was
  based on.

Every number is read from chain or from the agent's inputs. Nothing here is edited by hand.
Files are written by the agent process and committed automatically.
