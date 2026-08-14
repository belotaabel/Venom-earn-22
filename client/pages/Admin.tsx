import { useEffect, useState } from "react";
import { Check, LockKeyhole, RefreshCw, X } from "lucide-react";

type Withdrawal = {
  id: number;
  telegramId: number;
  firstName: string;
  username: string | null;
  phoneNumber: string;
  accountName: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  date: string;
};

export default function Admin() {
  const [key, setKey] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [minimum, setMinimum] = useState(10);
  const [minimumDraft, setMinimumDraft] = useState("10");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async (adminKey = key) => {
    if (!adminKey) return;
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/withdrawals", { headers: { Authorization: `Bearer ${adminKey}` } });
    if (!response.ok) {
      setError("የአድሚን key ትክክል አይደለም።");
      setLoading(false);
      return;
    }
    const data = await response.json();
    setKey(adminKey);
    setWithdrawals(data.withdrawals);
    setMinimum(data.minimumWithdrawal);
    setMinimumDraft(String(data.minimumWithdrawal));
    setLoading(false);
  };

  useEffect(() => {
    const savedKey = sessionStorage.getItem("inviteearn-admin-key");
    if (savedKey) {
      setDraftKey(savedKey);
      void load(savedKey);
    }
  }, []);

  const saveMinimum = async () => {
    const response = await fetch("/api/admin/settings/minimum-withdrawal", {
      method: "PUT",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ amount: Number(minimumDraft) }),
    });
    if (response.ok) setMinimum(Number(minimumDraft));
  };

  const updateStatus = async (id: number, status: "approved" | "rejected") => {
    const response = await fetch(`/api/admin/withdrawals/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (response.ok) setWithdrawals((items) => items.map((item) => item.id === id ? { ...item, status } : item));
  };

  if (!key) return <div className="flex min-h-screen items-center justify-center bg-[#f6f8f7] p-5"><form onSubmit={(event) => { event.preventDefault(); sessionStorage.setItem("inviteearn-admin-key", draftKey); void load(draftKey); }} className="w-full max-w-sm rounded-[24px] bg-white p-8 shadow-[0_14px_30px_rgba(24,60,54,.08)]"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#183c36] text-[#b9f3d4]"><LockKeyhole size={22} /></div><h1 className="mt-5 text-center text-xl font-extrabold">InviteEarn Admin</h1><p className="mt-2 text-center text-sm text-[#82908b]">የአድሚን panel ለመክፈት key ያስገቡ።</p><input autoFocus type="password" value={draftKey} onChange={(event) => setDraftKey(event.target.value)} placeholder="Admin panel key" className="mt-6 w-full rounded-xl border border-[#dbe7e1] px-4 py-3 outline-none focus:border-[#28a96d]" /><button className="mt-4 w-full rounded-xl bg-[#183c36] py-3.5 text-sm font-extrabold text-white">ግባ</button>{error && <p className="mt-3 text-center text-sm font-bold text-[#c45443]">{error}</p>}</form></div>;

  return <div className="min-h-screen bg-[#f6f8f7] text-[#142321]"><header className="border-b border-[#e3eae6] bg-white px-5 py-5 md:px-10"><div className="mx-auto flex max-w-[1200px] items-center justify-between"><div><p className="text-xs font-bold tracking-[0.12em] text-[#1b9460]">INVITEEARN ADMIN</p><h1 className="mt-1 text-2xl font-extrabold">Withdrawal ጥያቄዎች</h1></div><button onClick={() => void load()} className="flex items-center gap-2 rounded-xl border border-[#dbe7e1] bg-white px-4 py-2.5 text-sm font-bold text-[#557067]"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> አድስ</button></div></header><main className="mx-auto max-w-[1200px] px-5 py-8 md:px-10"><section className="mb-6 grid gap-5 md:grid-cols-[1fr_1.4fr]"><div className="rounded-[22px] bg-[#183c36] p-6 text-white"><p className="text-sm font-semibold text-[#b9f3d4]">Pending requests</p><p className="mt-3 text-4xl font-extrabold">{withdrawals.filter((item) => item.status === "pending").length}</p><p className="mt-2 text-sm text-[#b3cbc0]">የሚጠብቁ ጥያቄዎች</p></div><div className="rounded-[22px] border border-[#e3ebe7] bg-white p-6"><p className="text-sm font-bold text-[#596b65]">ዝቅተኛ ማውጣት</p><div className="mt-3 flex gap-3"><div className="flex flex-1 items-center rounded-xl border border-[#dbe7e1] px-4"><input type="number" min="0" value={minimumDraft} onChange={(event) => setMinimumDraft(event.target.value)} className="w-full bg-transparent py-3 text-xl font-extrabold outline-none" /><span className="font-bold text-[#87968f]">ብር</span></div><button onClick={() => void saveMinimum()} className="rounded-xl bg-[#28a96d] px-5 text-sm font-extrabold text-white">አስቀምጥ</button></div><p className="mt-2 text-xs text-[#8a9993]">አሁን ያለው መጠን: {minimum} ብር</p></div></section><section className="overflow-hidden rounded-[22px] border border-[#e3ebe7] bg-white"><div className="border-b border-[#edf1ef] px-6 py-5"><h2 className="font-extrabold">የማውጣት ጥያቄዎች</h2></div><div className="divide-y divide-[#edf1ef]">{withdrawals.length === 0 ? <p className="px-6 py-12 text-center text-sm text-[#82908b]">ገና ምንም ጥያቄ የለም።</p> : withdrawals.map((item) => <div key={item.id} className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e3f7eb] font-extrabold text-[#218c5c]">{item.firstName.slice(0, 2)}</div><div className="min-w-0 flex-1"><p className="font-extrabold">{item.firstName} {item.username ? `@${item.username}` : ""}</p><p className="mt-1 text-xs text-[#87958f]">{item.phoneNumber} · {item.accountName} · {item.date}</p></div><div className="text-left md:text-right"><p className="text-lg font-extrabold text-[#1b9460]">{Number(item.amount).toFixed(2)} ብር</p><p className={`text-xs font-bold ${item.status === "pending" ? "text-[#d58e29]" : item.status === "approved" ? "text-[#1b9460]" : "text-[#c45443]"}`}>{item.status}</p></div>{item.status === "pending" && <div className="flex gap-2"><button onClick={() => void updateStatus(item.id, "approved")} className="flex items-center gap-1 rounded-lg bg-[#e3f7eb] px-3 py-2 text-xs font-extrabold text-[#1b9460]"><Check size={14} /> ፍቀድ</button><button onClick={() => void updateStatus(item.id, "rejected")} className="flex items-center gap-1 rounded-lg bg-[#fff0ed] px-3 py-2 text-xs font-extrabold text-[#c45443]"><X size={14} /> ከልክል</button></div>}</div>)}</div></section></main></div>;
}
