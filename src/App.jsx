import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "./supabase";
import { AuthGate, LogoutButton } from "./Auth";

// ─── Theme ──────────────────────────────────────────────────────────
const T = {
  bg: "#FAF6F1",
  card: "#FFFFFF",
  cardBorder: "#EDE8E1",
  accent: "#D4793C",
  accentLight: "#F5E6D8",
  accentDark: "#B8612A",
  text: "#3D3429",
  textMid: "#8C7E6F",
  textLight: "#B5A99A",
  danger: "#D94F3D",
  success: "#5A9E6F",
  barTrack: "#EDE8E1",
  shadow: "rgba(180,160,140,0.08)",
};

// ─── Helpers ────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const monthKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const daysInMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
const daysLeft = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate(); };
const daysPassed = () => new Date().getDate();
const monthProgress = () => daysPassed() / daysInMonth();
const monthLabel = () => new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
const todayLabel = () => new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "long" });
const shiftMonth = (ms, delta) => { const [y, m] = ms.split("-").map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthLabelFor = (ms) => { const [y, m] = ms.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" }); };
const daysInMonthFor = (ms) => { const [y, m] = ms.split("-").map(Number); return new Date(y, m, 0).getDate(); };
const isCurrentMonth = (ms) => ms === monthKey();
const pluralDays = (n) => n === 1 ? "день" : (n >= 2 && n <= 4) ? "дня" : "дней";

const CAT_COLORS = [
  "#D4793C", "#5A9E6F", "#C75B5B", "#6B8FBF", "#9B7BC4",
  "#C9923E", "#4EA8A0", "#D4699A", "#7FAB5E", "#A67B5B",
  "#6C8B9E", "#BF7B4F", "#8B6FAE", "#C7884D", "#5B8C7A",
  "#B07070", "#7A9B5D",
];

// ─── Default budget ─────────────────────────────────────────────────
const DEFAULT_BUDGET = {
  total: 4069,
  month: monthKey(),
  categories: [
    { name: "Аренда", amount: 1410 },
    { name: "Электричество", amount: 80 },
    { name: "Интернет", amount: 80 },
    { name: "Связь", amount: 30 },
    { name: "ChatGPT", amount: 20 },
    { name: "Claude", amount: 100 },
    { name: "IPTV", amount: 9 },
    { name: "Продукты", amount: 400 },
    { name: "Хобби", amount: 200 },
    { name: "Транспорт", amount: 150 },
    { name: "Кафе/Рестораны", amount: 50 },
    { name: "Аптеки", amount: 120 },
    { name: "Ребёнок", amount: 300 },
    { name: "Резерв", amount: 300 },
    { name: "Медицинская", amount: 200 },
    { name: "Отпуск", amount: 400 },
    { name: "Родители", amount: 220 },
  ],
};

// ─── CSV ────────────────────────────────────────────────────────────
function exportCSV(transactions) {
  const header = "Дата,Категория,Сумма,Описание\n";
  const rows = transactions.map(t =>
    `${t.date},"${t.category}",${t.amount.toFixed(2)},"${(t.note || "").replace(/"/g, '""')}"`
  ).join("\n");
  const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `transactions-${monthKey()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ─── Depleting Bar with pace shadow ─────────────────────────────────
function DepletingBar({ spent, total, color, showPace = true }) {
  const remainPct = total > 0 ? Math.max(0, ((total - spent) / total) * 100) : 0;
  const over = spent > total;
  const idealRemainPct = showPace ? Math.max(0, (1 - monthProgress()) * 100) : 0;

  return (
    <div style={{ height: 8, borderRadius: 4, background: T.barTrack, overflow: "hidden", position: "relative" }}>
      <div style={{
        position: "absolute", top: 0, left: 0, height: "100%", borderRadius: 4,
        width: `${idealRemainPct}%`,
        background: "rgba(0,0,0,0.06)",
        transition: "width 0.5s",
      }} />
      <div style={{
        position: "absolute", top: 0, left: 0, height: "100%", borderRadius: 4,
        width: `${remainPct}%`,
        background: over ? T.danger : color || T.accent,
        transition: "width 0.5s cubic-bezier(.4,0,.2,1)",
      }} />
    </div>
  );
}

// ─── Quick Expense Modal ─────────────────────────────────────────────
function QuickExpenseModal({ category, onSave, onClose }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [saved, setSaved] = useState(false);

  const save = () => {
    if (!amount || parseFloat(amount) <= 0) return;
    onSave({
      id: uid(),
      amount: parseFloat(amount),
      category: category.name,
      note: note.trim(),
      date,
      timestamp: Date.now(),
    });
    setSaved(true);
    setTimeout(() => onClose(), 800);
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(61,52,41,0.4)",
      backdropFilter: "blur(4px)", display: "flex",
      flexDirection: "column", justifyContent: "flex-start",
      alignItems: "center",
      zIndex: 100, padding: "60px 16px 16px",
      overflow: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.card, borderRadius: 20, padding: "20px 18px 16px",
        width: "100%", maxWidth: 400,
        boxShadow: "0 4px 32px rgba(0,0,0,0.15)",
        animation: "slideUp 0.2s ease",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 5, background: category.color }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{category.name}</span>
          </div>
          <span style={{ fontSize: 12, color: T.textMid, fontFamily: "'JetBrains Mono', monospace" }}>
            ост. {fmt(category.remaining)}
          </span>
        </div>

        <input
          type="number" placeholder="Сумма" value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{ ...inputStyle, fontSize: 22, textAlign: "center", padding: "12px 14px", marginBottom: 10 }}
          autoFocus
          onKeyDown={e => e.key === "Enter" && (note || !amount ? save() : document.getElementById("qe-note")?.focus())}
        />
        <input
          id="qe-note"
          placeholder="Комментарий (необязательно)" value={note}
          onChange={e => setNote(e.target.value)}
          style={{ ...inputSmall, padding: "9px 12px", marginBottom: 10 }}
          onKeyDown={e => e.key === "Enter" && save()}
        />
        <input
          type="date" value={date}
          onChange={e => setDate(e.target.value)}
          style={{ ...inputSmall, padding: "7px 12px", marginBottom: 12, fontSize: 13, color: T.textMid }}
        />

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ ...btnSecondary, flex: 1, padding: "11px 12px", fontSize: 14 }}>Отмена</button>
          <button onClick={save} disabled={!amount || parseFloat(amount) <= 0}
            style={{
              ...btnPrimary, flex: 2, padding: "11px 12px", fontSize: 14,
              opacity: (!amount || parseFloat(amount) <= 0) ? 0.4 : 1,
              background: saved ? T.success : T.accent,
            }}>
            {saved ? "✓" : "Записать"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Category Card (clickable) ──────────────────────────────────────
function CategoryCard({ cat, index, spentAmount, onClick, showPace = true }) {
  const s = spentAmount || 0;
  const remaining = cat.amount - s;
  const color = CAT_COLORS[index % CAT_COLORS.length];
  return (
    <div onClick={() => onClick({ ...cat, color, remaining })} style={{
      background: T.card, borderRadius: 14, padding: "14px 16px",
      border: `1px solid ${T.cardBorder}`, cursor: "pointer",
      transition: "box-shadow 0.15s",
    }}
    onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 2px 12px ${T.shadow}`; }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 14, color: T.text, fontWeight: 500 }}>{cat.name}</span>
        </div>
        <span style={{
          fontSize: 14, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
          color: remaining < 0 ? T.danger : T.text,
        }}>
          {fmt(remaining)}
        </span>
      </div>
      <DepletingBar spent={s} total={cat.amount} color={color} showPace={showPace} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11, color: T.textLight, fontFamily: "'JetBrains Mono', monospace" }}>
        <span>−{fmt(s)}</span>
        <span>{fmt(cat.amount)}</span>
      </div>
    </div>
  );
}

// ─── Pinned categories (always visible on dashboard) ────────────────
const PINNED = ["Продукты", "Транспорт", "Ребёнок"];

// ─── DASHBOARD ──────────────────────────────────────────────────────
function Dashboard({ budget, transactions, onNavigate, onAddTransaction, viewMonth, onChangeMonth, onPlanNextMonth, nextMonthExists, pocketWithdrawalIds = new Set(), pocketNames = new Set() }) {
  const cats = budget?.categories || [];
  const totalBudget = budget?.total || 0;
  const allocated = cats.reduce((a, c) => a + c.amount, 0);
  const unallocated = totalBudget - allocated;
  // Exclude pocket withdrawals from budget calculations
  const regularTransactions = useMemo(() =>
    transactions.filter(t => !pocketWithdrawalIds.has(t.id)),
    [transactions, pocketWithdrawalIds]
  );
  const spent = useMemo(() => {
    const map = {};
    regularTransactions.forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return map;
  }, [regularTransactions]);
  const totalSpent = Object.values(spent).reduce((a, b) => a + b, 0);
  const totalOverspend = cats.reduce((sum, c) => {
    const rem = c.amount - (spent[c.name] || 0);
    return rem < 0 ? sum + Math.abs(rem) : sum;
  }, 0);
  const isCurrent = isCurrentMonth(viewMonth);
  const days = isCurrent ? daysLeft() : 0;
  const maxMonth = shiftMonth(monthKey(), 1);
  const canGoForward = viewMonth < maxMonth;

  const [expanded, setExpanded] = useState(false);
  const [modalCat, setModalCat] = useState(null);

  const pinnedCats = cats.filter(c => PINNED.includes(c.name));
  const otherCats = cats.filter(c => !PINNED.includes(c.name));

  if (!budget || cats.length === 0) {
    return (
      <div style={{ padding: "20px 16px", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 24, marginTop: 8 }}>
          <button onClick={() => onChangeMonth(shiftMonth(viewMonth, -1))} style={navArrow}>◀</button>
          <span style={{ color: T.text, fontSize: 16, fontWeight: 600, minWidth: 160, textAlign: "center" }}>
            {isCurrent ? todayLabel() : monthLabelFor(viewMonth)}
          </span>
          <button onClick={() => canGoForward && onChangeMonth(shiftMonth(viewMonth, 1))} style={{ ...navArrow, opacity: canGoForward ? 1 : 0.25 }} disabled={!canGoForward}>▶</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 24, padding: 32 }}>
          <div style={{ fontSize: 48, opacity: 0.3 }}>📊</div>
          <p style={{ color: T.textMid, fontSize: 16, textAlign: "center", lineHeight: 1.6, maxWidth: 320 }}>
            Бюджет на {monthLabelFor(viewMonth)} ещё не составлен.
          </p>
          <button onClick={() => onNavigate("plan")} style={btnPrimary}>Распланировать бюджет</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 16px", maxWidth: 480, margin: "0 auto" }}>
      {modalCat && (
        <QuickExpenseModal
          category={modalCat}
          onSave={onAddTransaction}
          onClose={() => setModalCat(null)}
        />
      )}

      {/* Header card */}
      <div style={{
        background: T.card, borderRadius: 18, padding: "24px 22px", marginBottom: 20,
        border: `1px solid ${T.cardBorder}`, boxShadow: `0 2px 12px ${T.shadow}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 10 }}>
          <button onClick={() => onChangeMonth(shiftMonth(viewMonth, -1))} style={navArrow}>◀</button>
          <span style={{ color: T.text, fontSize: 16, fontWeight: 600, minWidth: 160, textAlign: "center" }}>
            {isCurrent ? todayLabel() : monthLabelFor(viewMonth)}
          </span>
          <button onClick={() => canGoForward && onChangeMonth(shiftMonth(viewMonth, 1))} style={{ ...navArrow, opacity: canGoForward ? 1 : 0.25 }} disabled={!canGoForward}>▶</button>
        </div>
        {isCurrent && <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 2 }}>
          <span style={{
            fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
            color: days <= 5 ? T.danger : T.accent,
            background: days <= 5 ? "rgba(217,79,61,0.08)" : T.accentLight,
            padding: "3px 10px", borderRadius: 20,
          }}>
            {days} {pluralDays(days)} до конца
          </span>
        </div>}
        <div style={{ fontSize: 34, fontWeight: 700, color: T.text, fontFamily: "'JetBrains Mono', monospace", margin: "8px 0 6px" }}>
          {fmt(totalBudget - totalSpent)}
        </div>
        <div style={{ color: T.textMid, fontSize: 13, marginBottom: 14 }}>
          потрачено {fmt(totalSpent)} из {fmt(totalBudget)}
        </div>
        <DepletingBar spent={totalSpent} total={totalBudget} color={T.accent} showPace={isCurrent} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11, color: T.textLight, fontFamily: "'JetBrains Mono', monospace" }}>
          <span>осталось</span>
          <span>бюджет</span>
        </div>
      </div>

      {/* Unallocated notice */}
      {unallocated > 0 && (
        <div style={{
          background: T.accentLight, borderRadius: 12, padding: "10px 16px", marginBottom: 16,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          border: `1px solid rgba(212,121,60,0.2)`,
        }}>
          <span style={{ color: T.accentDark, fontSize: 13 }}>Осталось к распределению</span>
          <span style={{ color: T.accent, fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            {fmt(unallocated)}
          </span>
        </div>
      )}
      {unallocated < 0 && (
        <div style={{
          background: "rgba(217,79,61,0.06)", borderRadius: 12, padding: "10px 16px", marginBottom: 16,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          border: "1px solid rgba(217,79,61,0.15)",
        }}>
          <span style={{ color: T.danger, fontSize: 13 }}>Перераспределено</span>
          <span style={{ color: T.danger, fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            {fmt(Math.abs(unallocated))}
          </span>
        </div>
      )}
      {totalOverspend > 0 && (
        <div style={{
          background: "rgba(217,79,61,0.06)", borderRadius: 12, padding: "10px 16px", marginBottom: 16,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          border: "1px solid rgba(217,79,61,0.15)",
        }}>
          <span style={{ color: T.danger, fontSize: 13 }}>Перерасход по категориям</span>
          <span style={{ color: T.danger, fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            {fmt(totalOverspend)}
          </span>
        </div>
      )}

      {/* Pinned categories */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pinnedCats.map(c => {
          const gi = cats.indexOf(c);
          return <CategoryCard key={c.name} cat={c} index={gi} spentAmount={spent[c.name] || 0} onClick={isCurrent ? setModalCat : () => {}} showPace={isCurrent} />;
        })}
      </div>

      {/* Collapsible rest */}
      {otherCats.length > 0 && (
        <>
          <button onClick={() => setExpanded(!expanded)} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            width: "100%", marginTop: 12, padding: "10px 0",
            background: "none", border: `1px dashed ${T.cardBorder}`,
            borderRadius: 12, color: T.textMid, fontSize: 13,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            <span style={{
              display: "inline-block", transition: "transform 0.2s",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)", fontSize: 10,
            }}>▼</span>
            {expanded ? "Свернуть" : `Показать все категории (ещё ${otherCats.length})`}
          </button>

          {expanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              {otherCats.map(c => {
                const gi = cats.indexOf(c);
                return <CategoryCard key={c.name} cat={c} index={gi} spentAmount={spent[c.name] || 0} onClick={isCurrent ? setModalCat : () => {}} showPace={isCurrent} />;
              })}
            </div>
          )}
        </>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        {isCurrent && <button onClick={() => onNavigate("expense")} style={{ ...btnPrimary, flex: 1 }}>+ Трата</button>}
        <button onClick={() => onNavigate("plan")} style={{ ...btnSecondary, flex: 1 }}>Перепланировать</button>
      </div>
      {isCurrent && !nextMonthExists && (
        <button onClick={onPlanNextMonth} style={{ ...btnSecondary, width: "100%", marginTop: 10 }}>
          Запланировать {monthLabelFor(shiftMonth(viewMonth, 1))}
        </button>
      )}

      {/* Recent transactions */}
      {transactions.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ color: T.textMid, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }}>Последние траты</span>
            <button onClick={() => exportCSV(transactions)} style={{
              background: "none", border: `1px solid ${T.cardBorder}`, color: T.accent,
              fontSize: 12, padding: "3px 10px", borderRadius: 8, cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              CSV ↓
            </button>
          </div>
          {transactions.slice(-10).reverse().map(t => {
            const isPocketWithdrawal = pocketWithdrawalIds.has(t.id);
            return (
              <div key={t.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 0", borderBottom: `1px solid ${T.cardBorder}`,
              }}>
                <div>
                  <div style={{ fontSize: 14, color: T.text }}>
                    {isPocketWithdrawal && <span style={{ color: "#6B8FBF", marginRight: 4 }}>▤</span>}
                    {t.category}
                  </div>
                  {isPocketWithdrawal && <div style={{ fontSize: 11, color: "#6B8FBF" }}>из кармашка</div>}
                  {t.note && <div style={{ fontSize: 12, color: T.textLight, marginTop: 2 }}>{t.note}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, color: isPocketWithdrawal ? "#6B8FBF" : T.danger, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                    −{fmt(t.amount)}
                  </div>
                  <div style={{ fontSize: 11, color: T.textLight }}>{t.date}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── PLAN BUDGET ────────────────────────────────────────────────────
function PlanBudget({ budget: existingBudget, onSave, onBack, month, templateBudget, pocketNames }) {
  const template = existingBudget || templateBudget;
  const [step, setStep] = useState(template ? "categories" : "total");
  const [total, setTotal] = useState(template?.total || "");
  const [categories, setCategories] = useState(template?.categories ? template.categories.map(c => ({ ...c })) : []);
  const [newCatName, setNewCatName] = useState("");
  const [newCatAmount, setNewCatAmount] = useState("");
  const [newCatIsPocket, setNewCatIsPocket] = useState(false);
  const [editingTotal, setEditingTotal] = useState(false);

  const allocated = categories.reduce((a, c) => a + c.amount, 0);
  const remaining = (Number(total) || 0) - allocated;

  const addCategory = async () => {
    const name = newCatName.trim();
    const amount = parseFloat(newCatAmount);
    if (!name || isNaN(amount) || amount <= 0) return;
    if (categories.some(c => c.name === name)) return;
    setCategories([...categories, { name, amount }]);
    if (newCatIsPocket) {
      await db.createPocket(name, 0, 0);
    }
    setNewCatName(""); setNewCatAmount(""); setNewCatIsPocket(false);
  };

  const removeCategory = (name) => setCategories(categories.filter(c => c.name !== name));

  const updateAmount = (name, newAmount) => {
    setCategories(categories.map(c => c.name === name ? { ...c, amount: parseFloat(newAmount) || 0 } : c));
  };

  const save = () => {
    onSave({ total: Number(total), categories, month: month || monthKey() });
  };

  if (step === "total") {
    return (
      <div style={{ padding: "24px 16px", maxWidth: 480, margin: "0 auto" }}>
        <button onClick={onBack} style={btnBack}>← Назад</button>
        <h2 style={heading}>Сколько денег на {monthLabelFor(month || monthKey())}?</h2>
        <p style={{ color: T.textMid, fontSize: 14, marginBottom: 24 }}>
          Общая сумма, которую нужно распределить по категориям
        </p>
        <input
          type="number" placeholder="0.00" value={total}
          onChange={e => setTotal(e.target.value)}
          style={inputStyle} autoFocus
          onKeyDown={e => e.key === "Enter" && Number(total) > 0 && setStep("categories")}
        />
        <button
          onClick={() => setStep("categories")}
          disabled={!total || Number(total) <= 0}
          style={{ ...btnPrimary, width: "100%", marginTop: 16, opacity: (!total || Number(total) <= 0) ? 0.4 : 1 }}
        >
          Далее →
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 16px", maxWidth: 480, margin: "0 auto" }}>
      <button onClick={() => existingBudget ? onBack() : setStep("total")} style={btnBack}>← Назад</button>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
        <h2 style={{ ...heading, marginBottom: 0 }}>Распредели</h2>
        {editingTotal ? (
          <input
            type="number" value={total}
            onChange={e => setTotal(e.target.value)}
            onBlur={() => setEditingTotal(false)}
            onKeyDown={e => e.key === "Enter" && setEditingTotal(false)}
            style={{
              ...inputSmall, width: 120, fontSize: 18, fontWeight: 700, padding: "4px 8px",
              fontFamily: "'JetBrains Mono', monospace", color: T.accent,
              borderColor: T.accent,
            }}
            autoFocus
          />
        ) : (
          <button onClick={() => setEditingTotal(true)} style={{
            background: "none", border: "none", cursor: "pointer", padding: 0,
            fontSize: 22, fontWeight: 700, color: T.accent,
            fontFamily: "'JetBrains Mono', monospace",
            borderBottom: `2px dashed ${T.accent}`,
          }}>
            {fmt(Number(total))}
          </button>
        )}
      </div>
      <p style={{ color: T.textLight, fontSize: 13, marginBottom: 18 }}>нажми на сумму, чтобы изменить</p>

      <div style={{
        background: remaining < 0 ? "rgba(217,79,61,0.06)" : remaining === 0 ? "rgba(90,158,111,0.06)" : T.accentLight,
        border: `1px solid ${remaining < 0 ? "rgba(217,79,61,0.2)" : remaining === 0 ? "rgba(90,158,111,0.2)" : "rgba(212,121,60,0.2)"}`,
        borderRadius: 12, padding: "12px 16px", marginBottom: 18,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: T.textMid, fontSize: 13 }}>Осталось распределить</span>
        <span style={{
          fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
          color: remaining < 0 ? T.danger : remaining === 0 ? T.success : T.accent,
        }}>
          {fmt(remaining)}
        </span>
      </div>

      {categories.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {categories.map((c, i) => (
            <div key={c.name} style={{
              background: T.card, borderRadius: 12, padding: "11px 14px",
              display: "flex", alignItems: "center", gap: 10,
              border: `1px solid ${T.cardBorder}`,
            }}>
              {pocketNames?.has(c.name)
                ? <span style={{ color: "#6B8FBF", fontSize: 14, flexShrink: 0 }}>▤</span>
                : <div style={{ width: 8, height: 8, borderRadius: 4, background: CAT_COLORS[i % CAT_COLORS.length], flexShrink: 0 }} />
              }
              <span style={{ flex: 1, color: T.text, fontSize: 14 }}>{c.name}</span>
              <input
                type="number" value={c.amount}
                onChange={e => updateAmount(c.name, e.target.value)}
                style={{ ...inputSmall, width: 90, textAlign: "right", padding: "6px 8px" }}
              />
              <span style={{ color: T.textLight, fontSize: 13 }}>€</span>
              <button onClick={() => removeCategory(c.name)} style={{
                background: "none", border: "none", color: T.danger, cursor: "pointer",
                fontSize: 18, padding: "0 4px", lineHeight: 1,
              }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{
        background: T.card, borderRadius: 12, padding: 12,
        border: `1px dashed rgba(212,121,60,0.35)`, marginBottom: 18,
      }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            placeholder="Категория" value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            style={{ ...inputSmall, flex: 2 }}
            onKeyDown={e => e.key === "Enter" && addCategory()}
          />
          <input
            type="number" placeholder="Сумма" value={newCatAmount}
            onChange={e => setNewCatAmount(e.target.value)}
            style={{ ...inputSmall, flex: 1 }}
            onKeyDown={e => e.key === "Enter" && addCategory()}
          />
          <button onClick={addCategory} style={{
            background: T.accent, border: "none", color: "#fff", borderRadius: 8,
            padding: "0 14px", cursor: "pointer", fontSize: 18, fontWeight: 300,
          }}>+</button>
        </div>
        <label style={{
          display: "flex", alignItems: "center", gap: 6, marginTop: 8,
          fontSize: 12, color: T.textMid, cursor: "pointer",
        }}>
          <input type="checkbox" checked={newCatIsPocket} onChange={e => setNewCatIsPocket(e.target.checked)}
            style={{ accentColor: "#6B8FBF" }} />
          <span style={{ color: "#6B8FBF" }}>▤</span> Кармашек (копить)
        </label>
      </div>

      {categories.length === 0 && (
        <div style={{ marginBottom: 18 }}>
          <p style={{ color: T.textLight, fontSize: 12, marginBottom: 8 }}>Быстрый старт:</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["Аренда", "Продукты", "Транспорт", "Ребёнок", "Аптеки", "Хобби", "Кафе/Рестораны", "Резерв"].map(name => (
              <button key={name} onClick={() => setNewCatName(name)}
                style={{
                  background: T.accentLight, border: `1px solid rgba(212,121,60,0.25)`,
                  color: T.accent, borderRadius: 20, padding: "5px 12px", fontSize: 12,
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <button onClick={save} disabled={categories.length === 0}
        style={{ ...btnPrimary, width: "100%", opacity: categories.length === 0 ? 0.4 : 1 }}>
        {remaining !== 0 && categories.length > 0
          ? `Сохранить (нераспред. ${fmt(remaining)})`
          : "Сохранить бюджет ✓"
        }
      </button>
    </div>
  );
}

// ─── ADD EXPENSE ────────────────────────────────────────────────────
function AddExpense({ budget, onSave, onBack, pockets = [], pocketBalances = {}, pendingPocket, onClearPendingPocket }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [saved, setSaved] = useState(false);
  const [fromPocket, setFromPocket] = useState(!!pendingPocket);
  const [selectedPocket, setSelectedPocket] = useState(pendingPocket?.name || "");

  // Handle pending pocket from "Потратить" button
  useEffect(() => {
    if (pendingPocket) {
      setFromPocket(true);
      setSelectedPocket(pendingPocket.name);
      onClearPendingPocket?.();
    }
  }, [pendingPocket, onClearPendingPocket]);

  const cats = budget?.categories || [];

  const save = () => {
    const cat = fromPocket ? selectedPocket : category;
    if (!amount || !cat) return;
    onSave({
      id: uid(),
      amount: parseFloat(amount),
      category: cat,
      note: note.trim(),
      date,
      timestamp: Date.now(),
    }, fromPocket);
    setSaved(true);
    setTimeout(() => { setSaved(false); setAmount(""); setCategory(""); setSelectedPocket(""); setNote(""); setDate(new Date().toISOString().split("T")[0]); }, 1200);
  };

  const hasPockets = pockets.length > 0;

  if (cats.length === 0 && !hasPockets) {
    return (
      <div style={{ padding: "24px 16px", maxWidth: 480, margin: "0 auto", textAlign: "center", paddingTop: 80 }}>
        <p style={{ color: T.textMid, fontSize: 15, marginBottom: 20 }}>Сначала составь бюджет</p>
        <button onClick={onBack} style={btnPrimary}>← К планированию</button>
      </div>
    );
  }

  const pocketColor = "#6B8FBF";
  const canSave = amount && (fromPocket ? selectedPocket : category);

  return (
    <div style={{ padding: "24px 16px", maxWidth: 480, margin: "0 auto" }}>
      <button onClick={onBack} style={btnBack}>← Назад</button>
      <h2 style={heading}>Новая трата</h2>

      <div style={{ marginBottom: 20 }}>
        <label style={label}>Сумма</label>
        <input
          type="number" placeholder="0.00" value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{ ...inputStyle, fontSize: 28, textAlign: "center" }}
          autoFocus
        />
      </div>

      {/* Source toggle */}
      {hasPockets && (
        <div style={{ marginBottom: 20 }}>
          <label style={label}>Откуда списать</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setFromPocket(false); setSelectedPocket(""); }}
              style={{
                flex: 1, padding: "10px 14px", fontSize: 13, borderRadius: 10,
                cursor: "pointer", fontFamily: "inherit", fontWeight: !fromPocket ? 600 : 400,
                background: !fromPocket ? T.accentLight : T.card,
                border: !fromPocket ? `1px solid rgba(212,121,60,0.3)` : `1px solid ${T.cardBorder}`,
                color: !fromPocket ? T.accent : T.textMid,
                transition: "all 0.15s",
              }}>Из бюджета</button>
            <button onClick={() => { setFromPocket(true); setCategory(""); }}
              style={{
                flex: 1, padding: "10px 14px", fontSize: 13, borderRadius: 10,
                cursor: "pointer", fontFamily: "inherit", fontWeight: fromPocket ? 600 : 400,
                background: fromPocket ? "rgba(107,143,191,0.1)" : T.card,
                border: fromPocket ? "1px solid rgba(107,143,191,0.3)" : `1px solid ${T.cardBorder}`,
                color: fromPocket ? pocketColor : T.textMid,
                transition: "all 0.15s",
              }}>Из кармашка</button>
          </div>
        </div>
      )}

      {/* Category or pocket selector */}
      {fromPocket ? (
        <div style={{ marginBottom: 20 }}>
          <label style={label}>Кармашек</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {pockets.map(p => {
              const sel = selectedPocket === p.name;
              const bal = pocketBalances[p.name] || 0;
              return (
                <button key={p.name} onClick={() => setSelectedPocket(p.name)}
                  style={{
                    background: sel ? pocketColor : T.card,
                    border: sel ? `1px solid ${pocketColor}` : `1px solid ${T.cardBorder}`,
                    color: sel ? "#fff" : T.text,
                    borderRadius: 10, padding: "10px 14px", fontSize: 13,
                    cursor: "pointer", fontFamily: "inherit", fontWeight: sel ? 600 : 400,
                    transition: "all 0.15s",
                  }}>
                  <span>▤ {p.name}</span>
                  <span style={{
                    display: "block", fontSize: 11, marginTop: 2,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: sel ? "rgba(255,255,255,0.8)" : T.textMid,
                  }}>{fmt(bal)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          <label style={label}>Категория</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {cats.map((c, i) => {
              const col = CAT_COLORS[i % CAT_COLORS.length];
              const sel = category === c.name;
              return (
                <button key={c.name} onClick={() => setCategory(c.name)}
                  style={{
                    background: sel ? col : T.card,
                    border: sel ? `1px solid ${col}` : `1px solid ${T.cardBorder}`,
                    color: sel ? "#fff" : T.text,
                    borderRadius: 10, padding: "10px 14px", fontSize: 13,
                    cursor: "pointer", fontFamily: "inherit", fontWeight: sel ? 600 : 400,
                    transition: "all 0.15s",
                  }}>
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <label style={label}>Описание <span style={{ color: T.textLight }}>(необязательно)</span></label>
        <input
          placeholder="Что купил?" value={note}
          onChange={e => setNote(e.target.value)}
          style={inputSmall}
          onKeyDown={e => e.key === "Enter" && save()}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={label}>Дата</label>
        <input
          type="date" value={date}
          onChange={e => setDate(e.target.value)}
          style={{ ...inputSmall, padding: "8px 12px", color: T.textMid }}
        />
      </div>

      <button onClick={save} disabled={!canSave}
        style={{
          ...btnPrimary, width: "100%",
          opacity: !canSave ? 0.4 : 1,
          background: saved ? T.success : (fromPocket ? "#6B8FBF" : T.accent),
        }}>
        {saved ? "Сохранено ✓" : (fromPocket ? "Списать из кармашка" : "Внести трату")}
      </button>
    </div>
  );
}

// ─── POCKET DETAIL MODAL ────────────────────────────────────────────
function PocketDetailModal({ pocket, balance, budget, transactions, pocketWithdrawalIds, onClose, onAdjust, onSpend, onArchive }) {
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [showAdjust, setShowAdjust] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const h = await db.getPocketTransactions(pocket.name);
      setHistory(h);
      setHistoryLoaded(true);
    })();
  }, [pocket.name]);

  // Данные текущего месяца
  const currentMonth = monthKey();
  const cat = budget?.categories?.find(c => c.name === pocket.name);
  const allocated = cat?.amount || 0;
  const monthlySpent = (transactions || [])
    .filter(t => t.category === pocket.name && !pocketWithdrawalIds.has(t.id))
    .reduce((s, t) => s + t.amount, 0);
  const expectedDeposit = Math.max(0, allocated - monthlySpent);

  const doAdjust = async () => {
    const val = parseFloat(adjustAmount);
    if (!val || isNaN(val)) return;
    await onAdjust(pocket.name, val, adjustNote.trim());
    setAdjustAmount(""); setAdjustNote(""); setShowAdjust(false);
  };

  const pocketColor = "#6B8FBF";

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(61,52,41,0.4)",
      backdropFilter: "blur(4px)", display: "flex", flexDirection: "column",
      justifyContent: "flex-start", alignItems: "center",
      zIndex: 100, padding: "40px 16px 16px", overflow: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.card, borderRadius: 20, padding: "24px 20px",
        width: "100%", maxWidth: 440, boxShadow: "0 4px 32px rgba(0,0,0,0.15)",
        animation: "slideUp 0.2s ease",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16, color: pocketColor }}>▤</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{pocket.name}</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: T.textLight, cursor: "pointer" }}>×</button>
        </div>

        {/* Balance */}
        <div style={{
          background: "rgba(107,143,191,0.06)", borderRadius: 14, padding: "16px 18px",
          marginBottom: 16, border: "1px solid rgba(107,143,191,0.15)",
        }}>
          <div style={{ color: T.textMid, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>Накоплено</div>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: T.text }}>
            {fmt(balance)}
          </div>
          {pocket.target > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textMid, marginBottom: 4 }}>
                <span>Цель: {fmt(pocket.target)}</span>
                <span>{Math.min(100, Math.round((balance / pocket.target) * 100))}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: T.barTrack }}>
                <div style={{
                  height: "100%", borderRadius: 3, background: pocketColor,
                  width: `${Math.min(100, (balance / pocket.target) * 100)}%`,
                  transition: "width 0.5s",
                }} />
              </div>
            </div>
          )}
        </div>

        {/* This month info */}
        {allocated > 0 && (
          <div style={{
            background: T.accentLight, borderRadius: 12, padding: "12px 16px",
            marginBottom: 16, border: "1px solid rgba(212,121,60,0.2)",
          }}>
            <div style={{ color: T.textMid, fontSize: 12, marginBottom: 6 }}>В этом месяце</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: T.text }}>
              <span>Выделено: {fmt(allocated)}</span>
              <span>Потрачено: {fmt(monthlySpent)}</span>
            </div>
            <div style={{ color: T.accent, fontSize: 13, fontWeight: 600, marginTop: 4 }}>
              В копилку: ~{fmt(expectedDeposit)}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={() => setShowAdjust(!showAdjust)} style={{ ...btnSecondary, flex: 1, padding: "10px 12px", fontSize: 13 }}>
            Корректировка
          </button>
          <button onClick={() => onSpend(pocket)} style={{ ...btnPrimary, flex: 1, padding: "10px 12px", fontSize: 13 }}>
            Потратить
          </button>
        </div>

        {/* Manual adjustment */}
        {showAdjust && (
          <div style={{
            background: T.bg, borderRadius: 12, padding: 14, marginBottom: 16,
            border: `1px solid ${T.cardBorder}`,
          }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input type="number" placeholder="Сумма (+ или −)" value={adjustAmount}
                onChange={e => setAdjustAmount(e.target.value)}
                style={{ ...inputSmall, flex: 1 }} autoFocus />
            </div>
            <input placeholder="Комментарий" value={adjustNote}
              onChange={e => setAdjustNote(e.target.value)}
              style={{ ...inputSmall, marginBottom: 8 }}
              onKeyDown={e => e.key === "Enter" && doAdjust()} />
            <button onClick={doAdjust} disabled={!adjustAmount || parseFloat(adjustAmount) === 0}
              style={{ ...btnPrimary, width: "100%", padding: "10px", fontSize: 13, opacity: (!adjustAmount || parseFloat(adjustAmount) === 0) ? 0.4 : 1 }}>
              Применить
            </button>
          </div>
        )}

        {/* History */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: T.textMid, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>История</div>
          {!historyLoaded && <div style={{ color: T.textLight, fontSize: 13 }}>Загрузка...</div>}
          {historyLoaded && history.length === 0 && <div style={{ color: T.textLight, fontSize: 13 }}>Пока пусто</div>}
          {history.slice(0, 20).map(h => (
            <div key={h.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 0", borderBottom: `1px solid ${T.cardBorder}`,
            }}>
              <div>
                <div style={{ fontSize: 13, color: T.text }}>
                  {h.type === 'withdrawal' ? 'Списание' : 'Корректировка'}
                </div>
                {h.note && <div style={{ fontSize: 11, color: T.textLight }}>{h.note}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{
                  fontSize: 13, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                  color: h.amount < 0 ? T.danger : T.success,
                }}>
                  {h.amount > 0 ? '+' : ''}{fmt(h.amount)}
                </div>
                <div style={{ fontSize: 11, color: T.textLight }}>{h.date}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Archive */}
        <button onClick={() => { onArchive(pocket.name); onClose(); }}
          style={{ background: "none", border: "none", color: T.danger, fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "8px 0" }}>
          Архивировать кармашек
        </button>
      </div>
    </div>
  );
}

// ─── POCKETS SCREEN ─────────────────────────────────────────────────
function Pockets({ pockets, pocketBalances, budget, transactions, pocketWithdrawalIds, onCreatePocket, onAdjust, onArchive, onSpend, onRefresh }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newInitial, setNewInitial] = useState("");
  const [detailPocket, setDetailPocket] = useState(null);

  const pocketColor = "#6B8FBF";
  const totalBalance = Object.values(pocketBalances).reduce((a, b) => a + b, 0);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    await onCreatePocket(name, parseFloat(newTarget) || 0, parseFloat(newInitial) || 0);
    setNewName(""); setNewTarget(""); setNewInitial(""); setShowCreate(false);
  };

  return (
    <div style={{ padding: "20px 16px", maxWidth: 480, margin: "0 auto" }}>
      {detailPocket && (
        <PocketDetailModal
          pocket={detailPocket}
          balance={pocketBalances[detailPocket.name] || 0}
          budget={budget}
          transactions={transactions}
          pocketWithdrawalIds={pocketWithdrawalIds}
          onClose={() => setDetailPocket(null)}
          onAdjust={async (name, amount, note) => { await onAdjust(name, amount, note); setDetailPocket(null); }}
          onSpend={(p) => { setDetailPocket(null); onSpend(p); }}
          onArchive={onArchive}
        />
      )}

      <h2 style={{ ...heading, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: pocketColor }}>▤</span> Кармашки
      </h2>

      {/* Total */}
      {pockets.length > 0 && (
        <div style={{
          background: "rgba(107,143,191,0.06)", borderRadius: 14, padding: "16px 18px",
          marginBottom: 20, border: "1px solid rgba(107,143,191,0.15)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: T.textMid, fontSize: 13 }}>Общий баланс кармашков</span>
            <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: T.text }}>
              {fmt(totalBalance)}
            </span>
          </div>
        </div>
      )}

      {/* Pocket cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {pockets.map(p => {
          const bal = pocketBalances[p.name] || 0;
          const cat = budget?.categories?.find(c => c.name === p.name);
          const monthly = cat?.amount || 0;
          return (
            <div key={p.name} onClick={() => setDetailPocket(p)} style={{
              background: T.card, borderRadius: 14, padding: "14px 16px",
              border: `1px solid ${T.cardBorder}`, cursor: "pointer",
              transition: "box-shadow 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 2px 12px ${T.shadow}`; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: pocketColor, fontSize: 14 }}>▤</span>
                  <span style={{ fontSize: 14, color: T.text, fontWeight: 500 }}>{p.name}</span>
                </div>
                <span style={{ fontSize: 16, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: T.text }}>
                  {fmt(bal)}
                </span>
              </div>
              {p.target > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ height: 6, borderRadius: 3, background: T.barTrack }}>
                    <div style={{
                      height: "100%", borderRadius: 3, background: pocketColor,
                      width: `${Math.min(100, (bal / p.target) * 100)}%`,
                      transition: "width 0.5s",
                    }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 11, color: T.textLight, fontFamily: "'JetBrains Mono', monospace" }}>
                    <span>{Math.min(100, Math.round((bal / p.target) * 100))}%</span>
                    <span>{fmt(p.target)}</span>
                  </div>
                </div>
              )}
              {monthly > 0 && (
                <div style={{ fontSize: 12, color: T.textMid, marginTop: 2 }}>
                  +{fmt(monthly)}/мес
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {pockets.length === 0 && !showCreate && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: T.textMid }}>
          <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>▤</div>
          <p style={{ fontSize: 15, marginBottom: 8, lineHeight: 1.6 }}>
            Кармашки помогают копить на цели.
          </p>
          <p style={{ fontSize: 13, color: T.textLight, marginBottom: 20, lineHeight: 1.5 }}>
            Создай кармашек и привяжи его к категории в бюджете. Неизрасходованный остаток категории в конце месяца перейдёт в копилку.
          </p>
        </div>
      )}

      {/* Create pocket form */}
      {showCreate ? (
        <div style={{
          background: T.card, borderRadius: 14, padding: 16,
          border: `1px dashed rgba(107,143,191,0.4)`, marginBottom: 16,
        }}>
          <div style={{ marginBottom: 10 }}>
            <input placeholder="Название (напр. Отпуск)" value={newName}
              onChange={e => setNewName(e.target.value)}
              style={inputSmall} autoFocus />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input type="number" placeholder="Цель (необязательно)" value={newTarget}
              onChange={e => setNewTarget(e.target.value)}
              style={{ ...inputSmall, flex: 1 }} />
            <input type="number" placeholder="Нач. баланс" value={newInitial}
              onChange={e => setNewInitial(e.target.value)}
              style={{ ...inputSmall, flex: 1 }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowCreate(false)} style={{ ...btnSecondary, flex: 1, padding: "10px", fontSize: 13 }}>Отмена</button>
            <button onClick={create} disabled={!newName.trim()}
              style={{ ...btnPrimary, flex: 2, padding: "10px", fontSize: 13, opacity: !newName.trim() ? 0.4 : 1 }}>
              Создать
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowCreate(true)} style={{ ...btnSecondary, width: "100%", padding: "12px" }}>
          + Новый кармашек
        </button>
      )}
    </div>
  );
}

// ─── MAIN ───────────────────────────────────────────────────────────
// ─── Pocket balance calculation ─────────────────────────────────────
function calculatePocketBalances(pockets, allBudgets, allCategoryTxns, pocketTxns, currentMonth) {
  const balances = {};
  // Индексируем транзакции по категории+месяц
  const txnMap = {};
  allCategoryTxns.forEach(t => {
    const m = t.date.slice(0, 7);
    const key = `${t.category}::${m}`;
    txnMap[key] = (txnMap[key] || 0) + t.amount;
  });
  // Собираем withdrawal ids чтобы исключить их из месячных трат
  const withdrawalIds = new Set(
    pocketTxns.filter(t => t.type === 'withdrawal' && t.transaction_id).map(t => t.transaction_id)
  );
  // Пересчитываем txnMap без withdrawal транзакций
  const txnMapClean = {};
  allCategoryTxns.forEach(t => {
    if (withdrawalIds.has(t.id)) return;
    const m = t.date.slice(0, 7);
    const key = `${t.category}::${m}`;
    txnMapClean[key] = (txnMapClean[key] || 0) + t.amount;
  });

  for (const pocket of pockets) {
    let balance = pocket.initial_balance || 0;
    // Прибавить остатки за все ПРОШЛЫЕ месяцы
    for (const budget of allBudgets) {
      if (budget.month >= currentMonth) continue;
      const cat = budget.categories.find(c => c.name === pocket.name);
      if (!cat) continue;
      const spent = txnMapClean[`${pocket.name}::${budget.month}`] || 0;
      balance += cat.amount - spent;
    }
    // Pocket transactions (withdrawals + manual adjustments)
    const pTxns = pocketTxns.filter(t => t.pocket_name === pocket.name);
    balance += pTxns.reduce((sum, t) => sum + t.amount, 0);
    balances[pocket.name] = balance;
  }
  return balances;
}

function BudgetApp() {
  const [screen, setScreen] = useState("dashboard");
  const [budget, setBudget] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [viewMonth, setViewMonth] = useState(monthKey());
  const [nextMonthExists, setNextMonthExists] = useState(false);
  const [templateBudget, setTemplateBudget] = useState(null);

  // Pockets state
  const [pockets, setPockets] = useState([]);
  const [pocketBalances, setPocketBalances] = useState({});
  const [pocketWithdrawalIds, setPocketWithdrawalIds] = useState(new Set());
  const pocketNames = useMemo(() => new Set(pockets.map(p => p.name)), [pockets]);

  const loadPockets = useCallback(async () => {
    const p = await db.getPockets();
    if (p.length === 0) {
      setPockets([]);
      setPocketBalances({});
      setPocketWithdrawalIds(new Set());
      return;
    }
    const names = p.map(pk => pk.name);
    const [allB, allCT, allPT, wIds] = await Promise.all([
      db.getAllBudgets(),
      db.getAllTransactionsForCategories(names),
      db.getAllPocketTransactions(),
      db.getPocketWithdrawalIds(),
    ]);
    const balances = calculatePocketBalances(p, allB, allCT, allPT, monthKey());
    setPockets(p);
    setPocketBalances(balances);
    setPocketWithdrawalIds(new Set(wIds));
  }, []);

  useEffect(() => {
    setLoaded(false);
    (async () => {
      const b = await db.getBudget(viewMonth);
      const t = await db.getTransactions(viewMonth);
      if (b) {
        setBudget(b);
      } else if (isCurrentMonth(viewMonth)) {
        setBudget(DEFAULT_BUDGET);
        await db.saveBudget(DEFAULT_BUDGET);
      } else {
        setBudget(null);
      }
      setTransactions(t.length > 0 ? t : []);
      if (isCurrentMonth(viewMonth)) {
        const nb = await db.getBudget(shiftMonth(viewMonth, 1));
        setNextMonthExists(!!nb);
      }
      await loadPockets();
      setLoaded(true);
    })();
  }, [viewMonth, loadPockets]);

  const changeMonth = useCallback((m) => {
    setTemplateBudget(null);
    setViewMonth(m);
    setScreen("dashboard");
  }, []);

  const saveBudget = useCallback(async (b) => {
    setBudget(b);
    await db.saveBudget(b);
    setTemplateBudget(null);
    setViewMonth(b.month);
    setScreen("dashboard");
  }, []);

  const addTransaction = useCallback(async (t, fromPocket = false) => {
    const tMonth = t.date.slice(0, 7);
    if (tMonth === viewMonth) {
      setTransactions(prev => [...prev, t]);
    }
    await db.addTransaction(tMonth, t);
    if (fromPocket) {
      await db.withdrawFromPocket(t.category, t.amount, t.id, t.note, t.date);
      await loadPockets();
    }
  }, [viewMonth, loadPockets]);

  const planNextMonth = useCallback(() => {
    setTemplateBudget(budget);
    setViewMonth(shiftMonth(monthKey(), 1));
    setScreen("plan");
  }, [budget]);

  // Pocket callbacks
  const createPocket = useCallback(async (name, target, initialBalance) => {
    await db.createPocket(name, target, initialBalance);
    await loadPockets();
  }, [loadPockets]);

  const archivePocket = useCallback(async (name) => {
    await db.archivePocket(name);
    await loadPockets();
  }, [loadPockets]);

  const manualAdjustPocket = useCallback(async (name, amount, note) => {
    await db.manualAdjust(name, amount, note);
    await loadPockets();
  }, [loadPockets]);

  const spendFromPocket = useCallback((pocket) => {
    setScreen("expense");
    // Pass pocket info via a ref-like state
    setPendingPocket(pocket);
  }, []);

  const [pendingPocket, setPendingPocket] = useState(null);

  if (!loaded) return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent, fontFamily: "'JetBrains Mono', monospace" }}>
      Загрузка...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'Nunito', -apple-system, sans-serif", paddingBottom: 40 }}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        input::placeholder { color: ${T.textLight}; }
        input:focus { outline: none; border-color: ${T.accent} !important; }
        button { transition: all 0.15s; }
        button:active { transform: scale(0.97); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Nav */}
      <div style={{
        display: "flex", justifyContent: "center", gap: 4, padding: "14px 16px 8px",
        position: "sticky", top: 0, background: T.bg, zIndex: 10,
        borderBottom: `1px solid ${T.cardBorder}`,
      }}>
        {[
          { key: "dashboard", label: "Дашборд", icon: "◉" },
          { key: "plan", label: "Бюджет", icon: "☰" },
          { key: "expense", label: "Трата", icon: "+" },
          { key: "pockets", label: "Кармашки", icon: "▤" },
        ].map(tab => (
          <button key={tab.key} onClick={() => setScreen(tab.key)}
            style={{
              background: screen === tab.key ? T.accentLight : "transparent",
              border: screen === tab.key ? `1px solid rgba(212,121,60,0.3)` : "1px solid transparent",
              color: screen === tab.key ? T.accent : T.textLight,
              borderRadius: 10, padding: "8px 18px", fontSize: 13,
              cursor: "pointer", fontFamily: "inherit", fontWeight: screen === tab.key ? 700 : 400,
            }}>
            <span style={{ marginRight: 5 }}>{tab.icon}</span>{tab.label}
          </button>
        ))}
        <LogoutButton />
      </div>

      <div style={{ animation: "fadeIn 0.25s ease" }}>
        {screen === "dashboard" && <Dashboard budget={budget} transactions={transactions} onNavigate={setScreen} onAddTransaction={addTransaction} viewMonth={viewMonth} onChangeMonth={changeMonth} onPlanNextMonth={planNextMonth} nextMonthExists={nextMonthExists} pocketWithdrawalIds={pocketWithdrawalIds} pocketNames={pocketNames} />}
        {screen === "plan" && <PlanBudget budget={budget} onSave={saveBudget} onBack={() => setScreen("dashboard")} month={viewMonth} templateBudget={templateBudget} pocketNames={pocketNames} />}
        {screen === "expense" && <AddExpense budget={budget} onSave={addTransaction} onBack={() => setScreen("dashboard")} pockets={pockets} pocketBalances={pocketBalances} pendingPocket={pendingPocket} onClearPendingPocket={() => setPendingPocket(null)} />}
        {screen === "pockets" && <Pockets pockets={pockets} pocketBalances={pocketBalances} budget={budget} transactions={transactions} pocketWithdrawalIds={pocketWithdrawalIds} onCreatePocket={createPocket} onAdjust={manualAdjustPocket} onArchive={archivePocket} onSpend={spendFromPocket} onRefresh={loadPockets} />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthGate>
      <BudgetApp />
    </AuthGate>
  );
}

// ─── Shared Styles ──────────────────────────────────────────────────
const btnPrimary = {
  background: T.accent, border: "none", color: "#fff", borderRadius: 12,
  padding: "14px 24px", fontSize: 15, fontWeight: 600, cursor: "pointer",
  fontFamily: "inherit", letterSpacing: 0.3,
};
const btnSecondary = {
  background: T.accentLight, border: `1px solid rgba(212,121,60,0.25)`,
  color: T.accent, borderRadius: 12, padding: "14px 24px", fontSize: 15,
  fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
const btnBack = {
  background: "none", border: "none", color: T.accent, cursor: "pointer",
  fontSize: 14, padding: "8px 0", marginBottom: 16, fontFamily: "inherit",
};
const navArrow = {
  background: "none", border: `1px solid ${T.cardBorder}`, color: T.accent,
  borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center",
  justifyContent: "center", cursor: "pointer", fontSize: 14, fontFamily: "inherit",
};
const heading = {
  fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 8,
};
const label = {
  display: "block", color: T.textMid, fontSize: 12, textTransform: "uppercase",
  letterSpacing: 1.5, marginBottom: 8, fontWeight: 600,
};
const inputStyle = {
  width: "100%", background: T.card, border: `1px solid ${T.cardBorder}`,
  borderRadius: 12, padding: "14px 16px", color: T.text, fontSize: 18,
  fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box",
};
const inputSmall = {
  width: "100%", background: T.card, border: `1px solid ${T.cardBorder}`,
  borderRadius: 8, padding: "10px 12px", color: T.text, fontSize: 14,
  fontFamily: "inherit", boxSizing: "border-box",
};
