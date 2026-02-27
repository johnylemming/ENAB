import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── Data layer ─────────────────────────────────────────────────────
export const db = {
  async getBudget(month) {
    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('month', month)
      .maybeSingle()
    if (error) { console.error('getBudget:', error); return null }
    if (!data) return null
    return { total: Number(data.total), categories: data.categories, month: data.month }
  },

  async saveBudget(budget) {
    const { error } = await supabase
      .from('budgets')
      .upsert({
        month: budget.month,
        total: budget.total,
        categories: budget.categories,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'month' })
    if (error) console.error('saveBudget:', error)
  },

  async getTransactions(month) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('month', month)
      .order('timestamp', { ascending: true })
    if (error) { console.error('getTransactions:', error); return [] }
    return (data || []).map(t => ({
      id: t.transaction_id,
      amount: Number(t.amount),
      category: t.category,
      note: t.note,
      date: t.date,
      timestamp: t.timestamp,
    }))
  },

  async addTransaction(month, t) {
    const { error } = await supabase
      .from('transactions')
      .insert({
        month,
        transaction_id: t.id,
        amount: t.amount,
        category: t.category,
        note: t.note || '',
        date: t.date,
        timestamp: t.timestamp,
      })
    if (error) console.error('addTransaction:', error)
  },

  async deleteTransaction(transactionId) {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('transaction_id', transactionId)
    if (error) console.error('deleteTransaction:', error)
  },
}
