import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile, symlink, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import ts from "typescript"
import "@angular/compiler"

// Compile the service for Node without changing the Angular application build.
const temporary = await mkdtemp(join(process.cwd(), ".veridian-test-"))
try {
  await symlink(
    fileURLToPath(new URL("../../node_modules", import.meta.url)),
    join(temporary, "node_modules"),
  )
  for (const name of ["data", "store"]) {
    const source = await readFile(
      new URL(
        `../src/app/${name === "data" ? "core/models/data" : "core/state/portfolio.store"}.ts`,
        import.meta.url,
      ),
      "utf8",
    )
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        experimentalDecorators: true,
      },
    })
    await writeFile(
      join(temporary, `${name}.mjs`),
      outputText.replaceAll(
        name === "store" ? '"../models/data"' : '"./data"',
        name === "store" ? '"./data.mjs"' : '"./data.mjs"',
      ),
    )
  }
  const { default: Store } = await import(
    pathToFileURL(join(temporary, "store.mjs"))
  )
  const store = new Store()
  store.login("client", "newclient")
  assert.equal(store.cash, 0)
  assert.equal(store.name, "newclient")
  assert.equal(store.holdings.length, 0)
  assert.equal(store.clientOrders.length, 0)
  assert.equal(store.clientTransactions.length, 0)
  assert.throws(() => store.trade("NVDA", "Buy", 1), /buying power/)
  assert.throws(() => store.trade("NVDA", "Sell", 1), /holdings/)
  store.funds("Deposit", 1000)
  store.trade("NVDA", "Buy", 2)
  assert.equal(store.cash, 714.76)
  assert.equal(store.holdings[0].quantity, 2)
  assert.equal(store.clientOrders[0].client, "newclient")
  assert.equal(store.clientOrders[0].status, "Fulfilled")
  assert.match(store.clientOrders[0].date, /[A-Za-z]+ \d{1,2}, \d{4}.*[AP]M/)
  assert.match(store.clientTransactions[0].date, /[AP]M/)
  assert.throws(() => store.trade("NVDA", "Buy", 0.5), /whole shares/)
  assert.throws(() => store.funds("Withdrawal", 10000), /available balance/)
  assert.throws(() => store.funds("Deposit", NaN), /positive amount/)
  store.trade("NVDA", "Sell", 1)
  assert.equal(store.holdings[0].quantity, 1)
  store.login("client", "jordanlee")
  assert.equal(store.name, "Jordan Lee")
  assert.equal(store.cash, 18420.12)
  assert.equal(
    store.clientOrders.some((o) => o.client !== "jordanlee"),
    false,
  )
  store.login("client", "another")
  assert.equal(store.cash, 0)
  assert.equal(store.holdings.length, 0)
  store.login("client", "newclient")
  assert.equal(store.holdings[0].quantity, 1)
  assert.throws(() => store.login("client", "drewp"), /suspended/)
  store.login("reporter", "rpatel")
  assert.equal(store.name, "Rina Patel")
  assert.throws(
    () => store.saveAccount("clients", store.clients()[0]),
    /Administrator/,
  )
  store.login("admin", "admin")
  store.saveAccount("clients", {
    id: 99,
    username: "managed",
    email: "m@example.com",
    fullName: "Managed Client",
    cash: 0,
    status: "Active",
  })
  assert.equal(
    store.clients().find((a) => a.id === 99).fullName,
    "Managed Client",
  )
  assert.throws(
    () => store.saveAccount("clients", { ...store.clients()[0], id: 100 }),
    /already exists/,
  )
  console.log(
    "Passed: client isolation, identity, cash validation, trading, timestamps, and admin mutation restrictions.",
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}
