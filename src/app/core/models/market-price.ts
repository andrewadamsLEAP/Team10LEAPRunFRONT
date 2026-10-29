import { Instrument } from "./data"

export function marketPrice(instrument: Pick<Instrument, "bidPrice" | "askPrice">): number | null {
  const bid = instrument.bidPrice
  const ask = instrument.askPrice
  const validBid = bid !== null && Number.isFinite(bid) && bid > 0
  const validAsk = ask !== null && Number.isFinite(ask) && ask > 0
  if (validBid && validAsk) return bid + (ask - bid) / 2
  return validBid ? bid : validAsk ? ask : null
}

export function dailyChangePercent(instrument: Pick<Instrument, "bidPrice" | "askPrice" | "previousClose">): number | null {
  const price = marketPrice(instrument)
  const close = instrument.previousClose
  if (price === null || !Number.isFinite(close) || close <= 0) return null
  const change = (price - close) / close * 100
  return Number.isFinite(change) ? change : null
}
