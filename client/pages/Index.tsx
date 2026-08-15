import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  Copy,
  Gift,
  HelpCircle,
  Home,
  Link2,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Send,
  Settings,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";

declare global {
  interface Window {
    Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id: number } } } };
  }
}

type DashboardData = {
  user: { telegram_id: number; first_name: string; username: string | null };
  referrals: { count: number; total: number };
  recent: { name: string; reward: number; status: string; date: string }[];
  referralLink: string | null;
};


const navItems = [
  { label: "ዋና ገጽ", icon: Home, active: true },
  { label: "ግብዣዎች", icon: Users },
  { label: "ገንዘብ ቦርሳ", icon: Wallet },
];

export default function Index() {
  const [copied, setCopied] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showBotRegistration, setShowBotRegistration] = useState(false);
  const [registrationStarted, setRegistrationStarted] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [activeTab, setActiveTab] = useState("ዋና ገጽ");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [accessError, setAccessError] = useState("");
  const [withdrawalPhone, setWithdrawalPhone] = useState("");
  const [withdrawalOwner, setWithdrawalOwner] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawalError, setWithdrawalError] = useState("");
  const [withdrawalSubmitted, setWithdrawalSubmitted] = useState(false);
  const telegramId = typeof window !== "undefined" ? window.Telegram?.WebApp?.initDataUnsafe?.user?.id : undefined;
  const referralLink = dashboard?.referralLink ?? (telegramId ? `https://t.me/JanoEarn_bot?start=ref_${telegramId}` : "");
  const referralPercent = Math.min(Math.round(((dashboard?.referrals.count ?? 0) / 50) * 100), 100);

  useEffect(() => {
    if (!telegramId) return;
    const storageKey = "inviteearn-device-id";
    const storedDeviceId = window.localStorage.getItem(storageKey);
    const deviceId = storedDeviceId ?? crypto.randomUUID();
    if (!storedDeviceId) window.localStorage.setItem(storageKey, deviceId);
    fetch(`/api/dashboard?telegramId=${telegramId}&deviceId=${encodeURIComponent(deviceId)}`)
      .then(async (response) => {
        if (response.ok) return response.json() as Promise<DashboardData>;
        if (response.status === 409) {
          setAccessError("ይህ መሳሪያ ከሌላ Telegram አካውንት ጋር ተመዝግቧል።");
          return null;
        }
        return null;
      })
      .then((data) => setDashboard(data));
  }, [telegramId]);

  const openWithdrawal = () => {
    setWithdrawalError(dashboard?.referrals.total ? "" : "በቂ ባላንስ የልዎትም");
    setWithdrawalSubmitted(false);
    setWithdrawalPhone("");
    setWithdrawalOwner("");
    setWithdrawalAmount("");
    setShowWithdraw(true);
  };

  const submitWithdrawal = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(withdrawalAmount);
    if (!dashboard || dashboard.referrals.total < 30 || !Number.isFinite(amount) || amount < 30 || amount > dashboard.referrals.total) {
      setWithdrawalError("ዝቅተኛው የማውጫ መጠን 30 ብር ነው");
      return;
    }
    if (!/^09\d{8}$/.test(withdrawalPhone) || !withdrawalOwner.trim()) {
      setWithdrawalError("የTelebirr ቁጥርና የአካውንት ባለቤት ስም በትክክል ያስገቡ");
      return;
    }
    const response = await fetch("/api/withdrawals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ telegramId: dashboard.user.telegram_id, phoneNumber: withdrawalPhone, accountName: withdrawalOwner, amount }),
    });
    if (!response.ok) {
      setWithdrawalError(response.status === 400 ? "ዝቅተኛው የማውጫ መጠን 30 ብር ነው ወይም በቂ ባላንስ የልዎትም" : "ጥያቄው አልተላከም፣ እባክዎ ደግመው ይሞክሩ");
      return;
    }
    setWithdrawalSubmitted(true);
  };

  const navigateTab = (label: string) => {
    setActiveTab(label);
    setMobileMenu(false);
    const target = label === "ዋና ገጽ" ? "dashboard-top" : label === "ግብዣዎች" ? "referrals-section" : "wallet-section";
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const copyLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard?.writeText(referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="min-h-screen bg-[#f6f8f7] text-[#142321]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[#e3eae6] bg-white px-5 py-6 lg:flex">
        <Brand />
        <nav className="mt-14 space-y-2" aria-label="ዋና አሰሳ">
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} onClick={() => navigateTab(label)} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${activeTab === label ? "bg-[#dff8eb] text-[#16784d]" : "text-[#71817c] hover:bg-[#f1f5f3]"}`}>
              <Icon size={19} strokeWidth={activeTab === label ? 2.5 : 2} />
              {label}
              {label === "ግብዣዎች" && <span className="ml-auto rounded-full bg-[#f0f4f2] px-2 py-0.5 text-[11px] text-[#81908b]">{dashboard?.referrals.count ?? 0}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-2">
          <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-[#71817c] hover:bg-[#f1f5f3]"><HelpCircle size={19} /> እርዳታ እና ድጋፍ</button>
          <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-[#71817c] hover:bg-[#f1f5f3]"><Settings size={19} /> ቅንብሮች</button>
          <Link to="/admin" className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-[#71817c] hover:bg-[#f1f5f3]"><LockKeyhole size={19} /> አድሚንስትሬት</Link>
          <div className="mt-4 flex items-center gap-3 border-t border-[#e8eeeb] pt-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#183c36] text-xs font-bold text-[#b9f3d4]">{dashboard?.user.first_name.slice(0, 2) ?? "TG"}</div>
            <div className="min-w-0"><p className="truncate text-sm font-bold">{dashboard?.user.first_name ?? "Telegram ተጠቃሚ"}</p><p className="text-xs text-[#8b9894]">{dashboard?.user.username ? `@${dashboard.user.username}` : "Telegram account"}</p></div>
            <MoreHorizontal className="ml-auto text-[#94a09c]" size={18} />
          </div>
        </div>
      </aside>

      {mobileMenu && <div className="fixed inset-0 z-40 bg-[#142321]/30 lg:hidden" onClick={() => setMobileMenu(false)}><div className="h-full w-[280px] bg-white p-6" onClick={(e) => e.stopPropagation()}><div className="flex justify-between"><Brand /><button onClick={() => setMobileMenu(false)}><X size={20} /></button></div><nav className="mt-10 space-y-2">{navItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => navigateTab(label)} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${activeTab === label ? "bg-[#dff8eb] text-[#16784d]" : "text-[#71817c]"}`}><Icon size={19} />{label}</button>)}<Link to="/admin" onClick={() => setMobileMenu(false)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-[#71817c]"><LockKeyhole size={19} />አድሚንስትሬት</Link></nav></div></div>}

      <main className="min-h-screen lg:pl-[248px]">
        <header className="flex h-[76px] items-center justify-between border-b border-[#e3eae6] bg-white/80 px-5 backdrop-blur md:px-10">
          <button className="rounded-lg p-2 text-[#5e706a] lg:hidden" onClick={() => setMobileMenu(true)}><Menu size={21} /></button>
          <div className="hidden lg:block"><p className="text-xs font-medium text-[#96a39f]">{new Date().toLocaleDateString("am-ET", { dateStyle: "full" })}</p><h1 className="mt-0.5 text-[21px] font-extrabold tracking-[-0.02em]">እንደምን አለህ፣ {dashboard?.user.first_name ?? "የTelegram ተጠቃሚ"} <span className="text-[#1c9961]">👋</span></h1></div>
          <div className="flex items-center gap-3"><button className="relative rounded-full border border-[#e6ece9] p-2.5 text-[#71817c] hover:bg-[#f4f7f5]"><Bell size={18} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#ef6e54] ring-2 ring-white" /></button><div className="h-9 w-9 rounded-full bg-[#e9f8ef] p-1"><div className="flex h-full w-full items-center justify-center rounded-full bg-[#183c36] text-[10px] font-bold text-[#b9f3d4]">{dashboard?.user.first_name.slice(0, 2) ?? "TG"}</div></div></div>
        </header>

        <div id="dashboard-top" className="mx-auto min-h-[calc(100vh-76px)] max-w-[1280px] overflow-y-auto px-3 pb-24 pt-3 md:px-10 md:py-5">{accessError && <div className="mb-5 rounded-xl border border-[#f3c6be] bg-[#fff0ed] px-4 py-3 text-sm font-bold text-[#c45443]">{accessError}</div>}
          <div className="mb-2 flex items-end justify-between"><div><p className="text-sm font-medium text-[#84928d] lg:hidden">{new Date().toLocaleDateString("am-ET", { dateStyle: "full" })}</p><h2 className="text-2xl font-extrabold tracking-[-0.03em] lg:hidden">እንደምን አለህ፣ {dashboard?.user.first_name ?? "የTelegram ተጠቃሚ"} <span className="text-[#1c9961]">👋</span></h2><p className="mt-1 text-sm text-[#81908b]">{dashboard ? "ግብዣ ይጀምሩ፣ 3 ብር በ1 ሰው ያግኙ" : "ግብዣ ይጀምሩ፣ 3 ብር በ1 ሰው ያግኙ"}</p></div><button onClick={openWithdrawal} className="hidden items-center gap-2 rounded-xl bg-[#183c36] px-4 py-2.5 text-sm font-bold text-white shadow-[0_6px_18px_rgba(24,60,54,.15)] transition hover:bg-[#23574d] sm:flex"><Wallet size={16} /> ገንዘብ አውጣ</button></div>

          {activeTab === "ዋና ገጽ" && <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:gap-5 xl:grid-cols-[1.4fr_1fr]">
            <div className="relative overflow-hidden rounded-[18px] bg-[#183c36] p-3 text-white shadow-[0_14px_30px_rgba(24,60,54,.14)] md:rounded-[22px] md:p-6"><div className="absolute -right-12 -top-24 h-64 w-64 rounded-full border-[32px] border-[#3f9f72]/20" /><div className="absolute -bottom-28 right-20 h-52 w-52 rounded-full border-[22px] border-[#b9f3d4]/10" /><div className="relative"><div className="flex items-center gap-2 text-sm font-semibold text-[#b9f3d4]"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2b6254]"><Gift size={15} /></span> ጠቅላላ ገቢዎ</div><div className="mt-5 flex items-end gap-2"><span className="text-3xl font-extrabold tracking-[-0.05em] md:text-5xl md:text-[58px]">{(dashboard?.referrals.total ?? 0).toFixed(2)}</span><span className="mb-2 text-base font-semibold text-[#b9f3d4]">ብር</span></div><div className="mt-7 flex items-center justify-between border-t border-white/10 pt-4"><div><p className="text-xs text-[#a7c7ba]">የሚገኝ ቀሪ ሂሳብ</p><p className="mt-1 text-sm font-bold">{(dashboard?.referrals.total ?? 0).toFixed(2)} ብር</p></div><button onClick={openWithdrawal} className="flex items-center gap-1.5 rounded-lg bg-[#b9f3d4] px-3.5 py-2 text-xs font-extrabold text-[#183c36] hover:bg-white">አሁን አውጣ <ArrowUpRight size={14} /></button></div></div></div>
            <div className="rounded-[18px] border border-[#e3ebe7] bg-white p-3 md:rounded-[22px] md:p-6"><div className="flex items-start justify-between"><div><p className="text-sm font-bold text-[#596b65]">የዚህ ወር አፈጻጸም</p><p className="mt-3 text-3xl font-extrabold tracking-[-0.04em]">{dashboard?.referrals.count ?? 0} <span className="text-base font-semibold text-[#95a19d]">ግብዣዎች</span></p></div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e5f8ed] text-[#1b9b63]"><Users size={20} /></div></div><div className="mt-6 h-2 overflow-hidden rounded-full bg-[#edf2ef]"><div className="h-full rounded-full bg-[#47b77d]" style={{ width: `${referralPercent}%` }} /></div><div className="mt-2 flex justify-between text-xs text-[#8c9b95]"><span>ወደ 50 ግብዣ</span><span className="font-bold text-[#1b9b63]">{referralPercent}%</span></div><div className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#4c645b]"><Sparkles size={15} className="text-[#efa64a]" /> {dashboard?.referrals.count ? `${dashboard.referrals.count} ግብዣ ተሳክቷል` : "ገና ግብዣ አልተጀመረም"}</div></div>
          </section>
          </>}

          {activeTab === "ገንዘብ ቦርሳ" && <section id="wallet-section" className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-5 lg:grid-cols-[1.15fr_1fr]">
            <div className="rounded-[18px] border border-[#e3ebe7] bg-white p-3 md:rounded-[22px] md:p-6"><div className="flex items-center justify-between"><div><p className="text-lg font-extrabold">የእኔ የግብዣ ሊንክ</p><p className="mt-1 text-sm text-[#82908b]">ሊንኩን ለጓደኞችዎ ይላኩ እና በእያንዳንዱ ግብዣ <b className="text-[#1b9b63]">3 ብር</b> ያግኙ</p></div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff4df] text-[#d58e29]"><Link2 size={19} /></div></div><div className="mt-2 flex items-center gap-1 rounded-xl bg-[#f6f8f7] p-2 pl-4"><span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#6b7d76]">{referralLink.replace("https://", "")}</span><button onClick={copyLink} className="flex shrink-0 items-center gap-2 rounded-lg bg-[#183c36] px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-[#23574d]">{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "ተቀድቷል" : "ቅዳ"}</button></div><a href={referralLink || "#"} target="_blank" rel="noreferrer" className="mt-4 flex items-center gap-2 text-sm font-bold text-[#178354] hover:text-[#126944]"> <ChevronRight size={15} /></a></div>
            <div className="rounded-[18px] border border-[#e3ebe7] bg-[#eaf9f0] p-3 md:rounded-[22px] md:p-7"><div className="flex items-center justify-between"><p className="text-lg font-extrabold text-[#1d4238]">ወደ ቴሌብር አውጣ</p><div className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#19925d]">{dashboard ? "ክፍት" : "መጫን ላይ"}</div></div><p className="mt-2 max-w-sm text-sm leading-6 text-[#688278]">ያገኙትን ገቢ በቀላሉ ወደ ቴሌብር አካውንትዎ ያስተላልፉ።</p><button onClick={openWithdrawal} className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl bg-white py-3 text-sm font-extrabold text-[#1b7e52] shadow-sm hover:bg-[#f8fffa]">የማውጣት ጥያቄ አቅርብ <ArrowUpRight size={16} /></button></div>
          </section>}

          {activeTab === "ግብዣዎች" && <section id="referrals-section" className="mt-2 scroll-mt-24"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-lg font-extrabold">የቅርብ ጊዜ ግብዣዎች</h3><p className="mt-1 text-sm text-[#85938e]">ከግብዣዎችዎ የተገኘ ገቢ</p></div><button className="text-sm font-bold text-[#1b9460]">ሁሉንም እይ <ChevronRight className="inline" size={15} /></button></div><div className="overflow-hidden rounded-[18px] border border-[#e3ebe7] bg-white">{(dashboard?.recent ?? []).map((person, index) => <div key={person.name} className={`flex items-center gap-3 px-5 py-4 md:px-6 ${index !== (dashboard?.recent.length ?? 0) - 1 ? "border-b border-[#edf1ef]" : ""}`}><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e3f7eb] text-xs font-extrabold text-[#218c5c]">{person.name.slice(0, 2)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{person.name}</p><p className="mt-0.5 text-xs text-[#9aa6a2]">{person.date}</p></div><div className="text-right"><p className="text-sm font-extrabold text-[#1b9460]">+{person.reward.toFixed(2)} ብር</p><p className="mt-0.5 text-[11px] font-semibold text-[#8b9993]">{person.status}</p></div></div>)}</div></section>}
        </div>
      </main>

      <WithdrawalWizard open={showWithdraw} balance={dashboard?.referrals.total ?? 0} phone={withdrawalPhone} owner={withdrawalOwner} amount={withdrawalAmount} error={withdrawalError} submitted={withdrawalSubmitted} onPhoneChange={setWithdrawalPhone} onOwnerChange={setWithdrawalOwner} onAmountChange={setWithdrawalAmount} onSubmit={submitWithdrawal} onClose={() => setShowWithdraw(false)} />
      {showBotRegistration && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#142321]/40 p-5" onClick={() => setShowBotRegistration(false)}><div className="w-full max-w-md overflow-hidden rounded-[24px] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between bg-[#183c36] px-6 py-5 text-white"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2b6254] text-[#b9f3d4]"><Send size={19} /></div><div><p className="font-extrabold">InviteEarn Bot</p><p className="text-xs text-[#b9d7ca]">Telegram ላይ የግብዣ አጋርዎ</p></div></div><button onClick={() => setShowBotRegistration(false)} className="rounded-full p-1 text-[#b9d7ca] hover:bg-white/10"><X size={19} /></button></div><div className="p-6">{registered ? <div className="py-5 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#e2f8eb] text-[#1b9460]"><Check size={30} /></div><h3 className="mt-5 text-xl font-extrabold">እንኳን ደህና መጣህ፣ አበበ!</h3><p className="mt-2 text-sm leading-6 text-[#71817c]">ምዝገባህ ተሳክቷል። አሁን ጓደኞችህን ጋብዝና በእያንዳንዱ ግብዣ 3 ብር ያግኙ።</p><button onClick={() => setShowBotRegistration(false)} className="mt-6 w-full rounded-xl bg-[#183c36] py-3.5 text-sm font-extrabold text-white hover:bg-[#23574d]">ወደ ዳሽቦርድ ተመለስ</button></div> : !registrationStarted ? <><div className="rounded-2xl bg-[#f1f8f4] p-4"><div className="flex gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#b9f3d4] text-[#183c36]"><Gift size={17} /></div><div><p className="text-sm font-extrabold text-[#183c36]">ሰላም! እንኳን ወደ InviteEarn በደህና መጣህ</p><p className="mt-2 text-sm leading-6 text-[#627970]">ኮንታክትዎን በቴሌግራም ለቦቱ ያጋሩ፣ ምዝገባዎን ያጠናቅቁ እና ለእያንዳንዱ ግብዣ 3 ብር ያግኙ።</p></div></div></div><p className="mt-5 text-center text-sm text-[#82908b]">ለመጀመር ቦቱን ይክፈቱ እና “Share Contact” የሚለውን ይጫኑ።</p><button onClick={() => setRegistrationStarted(true)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#28a96d] py-3.5 text-sm font-extrabold text-white hover:bg-[#218d5b]">ኮንታክትዎን ያጋሩ <ChevronRight size={17} /></button><a href={referralLink || "#"} target="_blank" rel="noreferrer" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#dce8e1] py-3 text-sm font-bold text-[#457166] hover:bg-[#f5faf7]"> ቦቱን ክፈት እና ኮንታክት አጋራ</a></> : <form onSubmit={(event) => { event.preventDefault(); setRegistered(true); }}><p className="text-lg font-extrabold">ኮንታክትዎን ለቦቱ ያጋሩ</p><p className="mt-1 text-sm text-[#82908b]">በቴሌግራም ቦቱ ላይ ኮንታክትዎን በመላክ ምዝገባዎን ያጠናቅቁ።</p><label className="mt-5 block text-xs font-bold text-[#687a73]">የስልክ ቁጥር</label><input required placeholder="የቴሌግራም ስልክ ቁጥር" className="mt-2 w-full rounded-xl border border-[#dbe7e1] px-4 py-3 text-sm outline-none focus:border-[#28a96d]" /><label className="mt-4 block text-xs font-bold text-[#687a73]">የኮንታክት ማረጋገጫ</label><input required placeholder="ኮንታክትዎን አጋርተዋል?" className="mt-2 w-full rounded-xl border border-[#dbe7e1] px-4 py-3 text-sm outline-none focus:border-[#28a96d]" /><button type="submit" className="mt-6 w-full rounded-xl bg-[#183c36] py-3.5 text-sm font-extrabold text-white hover:bg-[#23574d]">ኮንታክት በመላክ ይመዝገቡ</button></form>}</div></div></div>}
      {false && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#142321]/40 p-5" onClick={() => setShowWithdraw(false)}><div className="w-full max-w-md rounded-[24px] bg-white p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-xl font-extrabold">ገንዘብ አውጣ</p><p className="mt-1 text-sm text-[#82908b]">ወደ ቴሌብር አካውንትዎ ይላኩ</p></div><button onClick={() => setShowWithdraw(false)} className="rounded-full p-1 text-[#889690] hover:bg-[#f1f5f3]"><X size={19} /></button></div><label className="mt-6 block text-xs font-bold text-[#687a73]">የሚወጣ መጠን</label><div className="mt-2 flex items-center rounded-xl border border-[#dbe7e1] px-4 py-3"><input className="w-full bg-transparent text-2xl font-extrabold outline-none" defaultValue={dashboard?.referrals.total ?? 0} type="number" /><span className="font-bold text-[#87968f]">ብር</span></div><div className="mt-3 flex justify-between text-xs text-[#8a9993]"><span>የሚገኝ ቀሪ ሂሳብ</span><span className="font-bold text-[#1b9460]">{(dashboard?.referrals.total ?? 0).toFixed(2)} ብር</span></div><button onClick={() => setShowWithdraw(false)} className="mt-7 w-full rounded-xl bg-[#183c36] py-3.5 text-sm font-extrabold text-white hover:bg-[#23574d]">የማውጣት ጥያቄ ላክ</button></div></div>}
      <div className="fixed bottom-0 left-0 right-0 z-20 flex justify-around border-t border-[#e3eae6] bg-white/95 px-2 py-2 backdrop-blur lg:hidden">{navItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => navigateTab(label)} className={`flex flex-col items-center gap-1 px-5 py-1 text-[10px] font-bold ${activeTab === label ? "text-[#168052]" : "text-[#8c9995]"}`}><Icon size={18} /><span>{label}</span></button>)}</div>
    </div>
  );
}

function Brand() {
  return <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#183c36] text-[#b9f3d4] shadow-[0_5px_12px_rgba(24,60,54,.18)]"><Gift size={21} strokeWidth={2.5} /></div><div><p className="text-[17px] font-extrabold tracking-[-0.03em]">Invite<span className="text-[#1b9460]">Earn</span></p><p className="text-[10px] font-semibold tracking-[0.12em] text-[#96a39f]">TELEGRAM REWARDS</p></div></div>;
}

type WithdrawalWizardProps = {
  open: boolean;
  balance: number;
  phone: string;
  owner: string;
  amount: string;
  error: string;
  submitted: boolean;
  onPhoneChange: (value: string) => void;
  onOwnerChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
};

function WithdrawalWizard({ open, balance, phone, owner, amount, error, submitted, onPhoneChange, onOwnerChange, onAmountChange, onSubmit, onClose }: WithdrawalWizardProps) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#142321]/40 p-5" onClick={onClose}><div className="w-full max-w-md rounded-[24px] bg-white p-7 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-xl font-extrabold">ወደ ቴሌብር አውጣ</p><p className="mt-1 text-sm text-[#82908b]">የማውጣት ጥያቄዎን ያስገቡ</p></div><button onClick={onClose} className="rounded-full p-1 text-[#889690] hover:bg-[#f1f5f3]"><X size={19} /></button></div>{submitted ? <div className="py-7 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#e2f8eb] text-[#1b9460]"><Check size={30} /></div><h3 className="mt-5 text-xl font-extrabold">ጥያቄዎ ወደአድሚን ተልኳል</h3><p className="mt-2 text-sm leading-6 text-[#71817c]">በቅርቡ ወደቴሌብርዎ ገቢ ይደረጋል።</p><button onClick={onClose} className="mt-6 w-full rounded-xl bg-[#183c36] py-3.5 text-sm font-extrabold text-white hover:bg-[#23574d]">ዝጋ</button></div> : <form onSubmit={onSubmit}><div className="mt-6 rounded-xl bg-[#eaf9f0] px-4 py-3"><p className="text-xs font-semibold text-[#688278]">ያሎት ቀሪ ሂሳብ</p><p className="mt-1 text-2xl font-extrabold text-[#1b9460]">{balance.toFixed(2)} ብር</p></div>{error && <p className="mt-4 rounded-lg bg-[#fff0ed] px-3 py-2 text-sm font-bold text-[#c45443]">{error}</p>}<label className="mt-5 block text-xs font-bold text-[#687a73]">የTelebirr ቁጥር</label><input required value={phone} onChange={(event) => onPhoneChange(event.target.value)} placeholder="09XXXXXXXX" inputMode="numeric" className="mt-2 w-full rounded-xl border border-[#dbe7e1] px-4 py-3 text-sm outline-none focus:border-[#28a96d]" /><label className="mt-4 block text-xs font-bold text-[#687a73]">የአካውንቱ ባለቤት ስም</label><input required value={owner} onChange={(event) => onOwnerChange(event.target.value)} placeholder="ሙሉ ስም" className="mt-2 w-full rounded-xl border border-[#dbe7e1] px-4 py-3 text-sm outline-none focus:border-[#28a96d]" /><label className="mt-4 block text-xs font-bold text-[#687a73]">ማውጣት የሚፈልጉት መጠን</label><div className="mt-2 flex items-center rounded-xl border border-[#dbe7e1] px-4 py-3"><input required min="0.01" max={balance} step="0.01" value={amount} onChange={(event) => onAmountChange(event.target.value)} type="number" className="w-full bg-transparent text-xl font-extrabold outline-none" placeholder="0.00" /><span className="font-bold text-[#87968f]">ብር</span></div><button disabled={balance <= 0} type="submit" className="mt-6 w-full rounded-xl bg-[#183c36] py-3.5 text-sm font-extrabold text-white hover:bg-[#23574d] disabled:cursor-not-allowed disabled:opacity-50">ጥያቄውን ወደ አድሚን ላክ</button></form>}</div></div>;
}
