export type Role = "client" | "reporter" | "admin"
export type ClientPage = "home" | "ticker" | "trade" | "confirm" | "orders" | "transactions" | "holdings"
export type EmployeePage = "orders" | "clients" | "reporters" | "transactions" | "analytics"
export type Side = "Buy" | "Sell"

export type Asset = {
  symbol: string
  name: string
  kind: "Stock" | "Crypto" | "Forex"
  price: number
  change: number
  volume: string
  open: number
  previous: number
  high: number
  low: number
}

export type Instrument = {
  ticker: string
  displayName: string | null
  assetType: "STOCK" | "CRYPTO" | "FOREX"
  previousClose: number
  open: number
  volume: number
  averageVolume: number
  bidPrice: number | null
  askPrice: number | null
  bidSize: number | null
  askSize: number | null
  quoteTimestamp: string | null
  recordedAt: string | null
  changePercent: number | null
}

export type Order = {
  id: string
  client: string
  ticker: string
  type: Side
  status: "Fulfilled" | "Pending" | "Cancelled"
  price: number
  quantity: number
  date: string
}

export type Transaction = {
  id: string
  client: string
  type: "Deposit" | "Withdrawal" | "Trade"
  amount: number
  date: string
  status: "Complete" | "Pending"
}

export type Account = {
  id: number
  username: string
  email: string
  fullName: string
  firstName?: string
  lastName?: string
  cash: number
  role?: string
  //status: "Active" | "Suspended"
}

export const assets: Asset[] = [
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    kind: "Stock",
    price: 142.62,
    change: 3.18,
    volume: "184.2M",
    open: 139.62,
    previous: 138.23,
    high: 144.14,
    low: 138.81,
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    kind: "Stock",
    price: 244.29,
    change: 0.9,
    volume: "77.6M",
    open: 241.83,
    previous: 242.11,
    high: 245.45,
    low: 240.13,
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc.",
    kind: "Stock",
    price: 352.56,
    change: -1.84,
    volume: "96.4M",
    open: 358.42,
    previous: 359.17,
    high: 361.22,
    low: 348.92,
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corporation",
    kind: "Stock",
    price: 448.43,
    change: -0.32,
    volume: "22.1M",
    open: 449.2,
    previous: 449.87,
    high: 451.36,
    low: 446.18,
  },
  {
    symbol: "AMZN",
    name: "Amazon.com Inc.",
    kind: "Stock",
    price: 212.22,
    change: 0.76,
    volume: "38.7M",
    open: 210.84,
    previous: 210.62,
    high: 213.1,
    low: 209.71,
  },
  {
    symbol: "META",
    name: "Meta Platforms Inc.",
    kind: "Stock",
    price: 642.18,
    change: 1.42,
    volume: "16.8M",
    open: 635.1,
    previous: 633.19,
    high: 644.2,
    low: 632.84,
  },
  {
    symbol: "BTC-USD",
    name: "Bitcoin",
    kind: "Crypto",
    price: 104632.8,
    change: 2.64,
    volume: "$48.3B",
    open: 101842,
    previous: 101943,
    high: 105220,
    low: 100891,
  },
  {
    symbol: "ETH-USD",
    name: "Ethereum",
    kind: "Crypto",
    price: 3428.12,
    change: 1.92,
    volume: "$18.7B",
    open: 3362.2,
    previous: 3363.53,
    high: 3461.42,
    low: 3328.18,
  },
  {
    symbol: "EUR-USD",
    name: "Euro / US Dollar",
    kind: "Forex",
    price: 1.0842,
    change: 0.28,
    volume: "$18.2B",
    open: 1.0812,
    previous: 1.0811,
    high: 1.0864,
    low: 1.0798,
  },
  {
    symbol: "GBP-USD",
    name: "British Pound / US Dollar",
    kind: "Forex",
    price: 1.2716,
    change: -0.14,
    volume: "$12.4B",
    open: 1.2732,
    previous: 1.2734,
    high: 1.2751,
    low: 1.2698,
  },
]

export const initialOrders: Order[] = [
  {
    id: "ORD-10482",
    client: "jordanlee",
    ticker: "NVDA",
    type: "Buy",
    status: "Fulfilled",
    price: 140.12,
    quantity: 12,
    date: "May 24, 2025 · 10:26 AM",
  },
  {
    id: "ORD-10481",
    client: "alexm",
    ticker: "BTC-USD",
    type: "Buy",
    status: "Pending",
    price: 103420,
    quantity: 0.04,
    date: "May 24, 2025 · 9:42 AM",
  },
  {
    id: "ORD-10480",
    client: "jordanlee",
    ticker: "AAPL",
    type: "Sell",
    status: "Fulfilled",
    price: 242.86,
    quantity: 6,
    date: "May 23, 2025 · 4:18 PM",
  },
  {
    id: "ORD-10479",
    client: "samira",
    ticker: "EUR-USD",
    type: "Buy",
    status: "Cancelled",
    price: 1.0821,
    quantity: 2500,
    date: "May 23, 2025 · 1:06 PM",
  },
]

export const initialTransactions: Transaction[] = [
  {
    id: "TRX-8821",
    client: "jordanlee",
    type: "Deposit",
    amount: 5000,
    date: "May 24, 2025",
    status: "Complete",
  },
  {
    id: "TRX-8820",
    client: "jordanlee",
    type: "Trade",
    amount: -1681.44,
    date: "May 24, 2025",
    status: "Complete",
  },
  {
    id: "TRX-8819",
    client: "alexm",
    type: "Withdrawal",
    amount: -1200,
    date: "May 23, 2025",
    status: "Pending",
  },
  {
    id: "TRX-8818",
    client: "samira",
    type: "Trade",
    amount: -2710.25,
    date: "May 23, 2025",
    status: "Complete",
  },
]

export const initialClients: Account[] = [
  {
    id: 1,
    username: "jordanlee",
    email: "jordan@example.com",
    fullName: "Jordan Lee",
    cash: 18420.12,
   // status: "Active",
  },
  {
    id: 2,
    username: "alexm",
    email: "alex@example.com",
    fullName: "Alex Morgan",
    cash: 12304.7,
   // status: "Active",
  },
  {
    id: 3,
    username: "samira",
    email: "samira@example.com",
    fullName: "Samira Cole",
    cash: 8821.42,
   // status: "Active",
  },
  {
    id: 4,
    username: "drewp",
    email: "drew@example.com",
    fullName: "Drew Parker",
    cash: 4280,
    //status: "Suspended",
  },
]

export const initialReporters: Account[] = [
  {
    id: 11,
    username: "rpatel",
    email: "rpatel@veridian.com",
    fullName: "Rina Patel",
    cash: 0,
   // status: "Active",
  },
  {
    id: 12,
    username: "mchen",
    email: "mchen@veridian.com",
    fullName: "Miles Chen",
    cash: 0,
   // status: "Active",
  },
  {
    id: 13,
    username: "krobin",
    email: "krobin@veridian.com",
    fullName: "Kai Robinson",
    cash: 0,
    //status: "Suspended",
  },
]
