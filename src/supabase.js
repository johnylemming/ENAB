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
    // Удалить связанную pocket_transaction если есть
    await supabase
      .from('pocket_transactions')
      .delete()
      .eq('transaction_id', transactionId)
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('transaction_id', transactionId)
    if (error) console.error('deleteTransaction:', error)
  },

  // ─── Pockets ───────────────────────────────────────────────────

  async getPockets() {
    const { data, error } = await supabase
      .from('pockets')
      .select('*')
      .is('archived_at', null)
      .order('created_at', { ascending: true })
    if (error) { console.error('getPockets:', error); return [] }
    return (data || []).map(p => ({
      ...p,
      target: Number(p.target),
      initial_balance: Number(p.initial_balance),
    }))
  },

  async createPocket(name, target = 0, initialBalance = 0) {
    const { error } = await supabase
      .from('pockets')
      .upsert({ name, target, initial_balance: initialBalance, archived_at: null }, { onConflict: 'name' })
    if (error) console.error('createPocket:', error)
  },

  async archivePocket(name) {
    const { error } = await supabase
      .from('pockets')
      .update({ archived_at: new Date().toISOString() })
      .eq('name', name)
    if (error) console.error('archivePocket:', error)
  },

  async updatePocket(name, fields) {
    const { error } = await supabase
      .from('pockets')
      .update(fields)
      .eq('name', name)
    if (error) console.error('updatePocket:', error)
  },

  async getAllBudgets() {
    const { data, error } = await supabase
      .from('budgets')
      .select('month, categories')
      .order('month', { ascending: true })
    if (error) { console.error('getAllBudgets:', error); return [] }
    return data || []
  },

  async getAllTransactionsForCategories(names) {
    if (!names.length) return []
    const { data, error } = await supabase
      .from('transactions')
      .select('transaction_id, amount, category, date')
      .in('category', names)
    if (error) { console.error('getAllTransactionsForCategories:', error); return [] }
    return (data || []).map(t => ({
      id: t.transaction_id,
      amount: Number(t.amount),
      category: t.category,
      date: t.date,
    }))
  },

  async getPocketTransactions(pocketName) {
    const { data, error } = await supabase
      .from('pocket_transactions')
      .select('*')
      .eq('pocket_name', pocketName)
      .order('created_at', { ascending: false })
    if (error) { console.error('getPocketTransactions:', error); return [] }
    return (data || []).map(t => ({ ...t, amount: Number(t.amount) }))
  },

  async getAllPocketTransactions() {
    const { data, error } = await supabase
      .from('pocket_transactions')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { console.error('getAllPocketTransactions:', error); return [] }
    return (data || []).map(t => ({ ...t, amount: Number(t.amount) }))
  },

  async getPocketWithdrawalIds() {
    const { data, error } = await supabase
      .from('pocket_transactions')
      .select('transaction_id')
      .eq('type', 'withdrawal')
      .not('transaction_id', 'is', null)
    if (error) { console.error('getPocketWithdrawalIds:', error); return [] }
    return (data || []).map(d => d.transaction_id)
  },

  async withdrawFromPocket(pocketName, amount, transactionId, note, date) {
    const { error } = await supabase
      .from('pocket_transactions')
      .insert({
        pocket_name: pocketName,
        amount: -Math.abs(amount),
        type: 'withdrawal',
        note: note || '',
        date,
        transaction_id: transactionId,
      })
    if (error) console.error('withdrawFromPocket:', error)
  },

  async manualAdjust(pocketName, amount, note) {
    const { error } = await supabase
      .from('pocket_transactions')
      .insert({
        pocket_name: pocketName,
        amount,
        type: 'manual_adjust',
        note: note || '',
        date: new Date().toISOString().split('T')[0],
      })
    if (error) console.error('manualAdjust:', error)
  },
}
