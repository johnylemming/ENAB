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
  const [saved, setSaved] = useState(false);

  const save = () => {
    if (!amount || parseFloat(amount) <= 0) return;
    onSave({
      id: uid(),
      amount: parseFloat(amount),
      category: category.name,
      note: note.trim(),
      date: new Date().toISOString().split("T")[0],
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
          style={{ ...inputSmall, padding: "9px 12px", marginBottom: 12 }}
          onKeyDown={e => e.key === "Enter" && save()}
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
function Dashboard({ budget, transactions, onNavigate, onAddTransaction, viewMonth, onChangeMonth, onPlanNextMonth, nextMonthExists }) {
  const cats = budget?.categories || [];
  const totalBudget = budget?.total || 0;
  const allocated = cats.reduce((a, c) => a + c.amount, 0);
  const unallocated = totalBudget - allocated;
  const spent = useMemo(() => {
    const map = {};
    transactions.forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return map;
  }, [transactions]);
  const totalSpent = Object.values(spent).reduce((a, b) => a + b, 0);
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
          {transactions.slice(-10).reverse().map(t => (
            <div key={t.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 0", borderBottom: `1px solid ${T.cardBorder}`,
            }}>
              <div>
                <div style={{ fontSize: 14, color: T.text }}>{t.category}</div>
                {t.note && <div style={{ fontSize: 12, color: T.textLight, marginTop: 2 }}>{t.note}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, color: T.danger, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                  −{fmt(t.amount)}
                </div>
                <div style={{ fontSize: 11, color: T.textLight }}>{t.date}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PLAN BUDGET ────────────────────────────────────────────────────
function PlanBudget({ budget: existingBudget, onSave, onBack, month, templateBudget }) {
  const template = existingBudget || templateBudget;
  const [step, setStep] = useState(template ? "categories" : "total");
  const [total, setTotal] = useState(template?.total || "");
  const [categories, setCategories] = useState(template?.categories ? template.categories.map(c => ({ ...c })) : []);
  const [newCatName, setNewCatName] = useState("");
  const [newCatAmount, setNewCatAmount] = useState("");
  const [editingTotal, setEditingTotal] = useState(false);

  const allocated = categories.reduce((a, c) => a + c.amount, 0);
  const remaining = (Number(total) || 0) - allocated;

  const addCategory = () => {
    const name = newCatName.trim();
    const amount = parseFloat(newCatAmount);
    if (!name || isNaN(amount) || amount <= 0) return;
    if (categories.some(c => c.name === name)) return;
    setCategories([...categories, { name, amount }]);
    setNewCatName(""); setNewCatAmount("");
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
              <div style={{ width: 8, height: 8, borderRadius: 4, background: CAT_COLORS[i % CAT_COLORS.length], flexShrink: 0 }} />
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
function AddExpense({ budget, onSave, onBack }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  const cats = budget?.categories || [];

  const save = () => {
    if (!amount || !category) return;
    onSave({
      id: uid(),
      amount: parseFloat(amount),
      category,
      note: note.trim(),
      date: new Date().toISOString().split("T")[0],
      timestamp: Date.now(),
    });
    setSaved(true);
    setTimeout(() => { setSaved(false); setAmount(""); setCategory(""); setNote(""); }, 1200);
  };

  if (cats.length === 0) {
    return (
      <div style={{ padding: "24px 16px", maxWidth: 480, margin: "0 auto", textAlign: "center", paddingTop: 80 }}>
        <p style={{ color: T.textMid, fontSize: 15, marginBottom: 20 }}>Сначала составь бюджет</p>
        <button onClick={onBack} style={btnPrimary}>← К планированию</button>
      </div>
    );
  }

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

      <div style={{ marginBottom: 24 }}>
        <label style={label}>Описание <span style={{ color: T.textLight }}>(необязательно)</span></label>
        <input
          placeholder="Что купил?" value={note}
          onChange={e => setNote(e.target.value)}
          style={inputSmall}
          onKeyDown={e => e.key === "Enter" && save()}
        />
      </div>

      <button onClick={save} disabled={!amount || !category}
        style={{
          ...btnPrimary, width: "100%",
          opacity: (!amount || !category) ? 0.4 : 1,
          background: saved ? T.success : T.accent,
        }}>
        {saved ? "Сохранено ✓" : "Внести трату"}
      </button>
    </div>
  );
}

// ─── MAIN ───────────────────────────────────────────────────────────
function BudgetApp() {
  const [screen, setScreen] = useState("dashboard");
  const [budget, setBudget] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [viewMonth, setViewMonth] = useState(monthKey());
  const [nextMonthExists, setNextMonthExists] = useState(false);
  const [templateBudget, setTemplateBudget] = useState(null);

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
      setLoaded(true);
    })();
  }, [viewMonth]);

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

  const addTransaction = useCallback(async (t) => {
    setTransactions(prev => [...prev, t]);
    await db.addTransaction(viewMonth, t);
  }, [viewMonth]);

  const planNextMonth = useCallback(() => {
    setTemplateBudget(budget);
    setViewMonth(shiftMonth(monthKey(), 1));
    setScreen("plan");
  }, [budget]);

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
        {screen === "dashboard" && <Dashboard budget={budget} transactions={transactions} onNavigate={setScreen} onAddTransaction={addTransaction} viewMonth={viewMonth} onChangeMonth={changeMonth} onPlanNextMonth={planNextMonth} nextMonthExists={nextMonthExists} />}
        {screen === "plan" && <PlanBudget budget={budget} onSave={saveBudget} onBack={() => setScreen("dashboard")} month={viewMonth} templateBudget={templateBudget} />}
        {screen === "expense" && <AddExpense budget={budget} onSave={addTransaction} onBack={() => setScreen("dashboard")} />}
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
