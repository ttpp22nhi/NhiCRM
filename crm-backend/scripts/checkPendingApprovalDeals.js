import 'dotenv/config'
import pool from '../database.js'

async function main() {
  const res = await pool.query(
    "SELECT COUNT(1) AS cnt FROM public.deals WHERE status = 'pending_approval'"
  )
  console.log('pending_approval_deals=', res.rows?.[0]?.cnt)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await pool.end()
    } catch {}
  })

