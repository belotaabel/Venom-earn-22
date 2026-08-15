import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { bindDevice, clearWithdrawalSession, createWithdrawal, getAdminWithdrawals, getDashboard, getMinimumWithdrawal, getWithdrawalSession, registerUser, savePendingReferral, saveWithdrawalSession, setMinimumWithdrawal, updateWithdrawalStatus } from "./db";

type TelegramMessage = {
  chat?: { id: number };
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
  contact?: { phone_number: string; first_name: string; user_id?: number };
};

type TelegramUpdate = {
  message?: TelegramMessage;
  callback_query?: { id: string; data?: string; from: { id: number }; message?: { message_id?: number; chat?: { id: number } } };
};

async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: object) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
    });
    if (!response.ok) console.error("Telegram sendMessage failed", await response.text());
  } catch (error) {
    console.error("Telegram sendMessage request failed", error);
  }
}

const REQUIRED_CHANNELS = ["@janoEarn2", "@janoEarn"];

async function isChannelMember(telegramId: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  const memberships = await Promise.all(REQUIRED_CHANNELS.map(async (channel) => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(channel)}&user_id=${telegramId}`);
      if (!response.ok) {
        console.error(`Telegram getChatMember failed for ${channel}`, await response.text());
        return false;
      }
      const data = (await response.json()) as { ok: boolean; result?: { status: string; is_member?: boolean } };
      return Boolean(data.ok && data.result && (["creator", "administrator", "member"].includes(data.result.status) || data.result.status === "restricted" && data.result.is_member));
    } catch (error) {
      console.error(`Telegram getChatMember request failed for ${channel}`, error);
      return false;
    }
  }));

  return memberships.every(Boolean);
}

async function sendJoinRequirement(chatId: number) {
  await sendTelegramMessage(chatId, "ለመመዝገብ መጀመሪያ ሁለቱንም InviteEarn ቻናሎች መቀላቀል ግዴታ ነው።\n\nሁለቱንም ከተቀላቀሉ በኋላ ‘አባልነቴን አረጋግጥ’ የሚለውን ይጫኑ።", {
    inline_keyboard: [
      ...REQUIRED_CHANNELS.map((channel) => [{ text: `${channel} ተቀላቀል`, url: `https://t.me/${channel.slice(1)}` }]),
      [{ text: "አባልነቴን አረጋግጥ", callback_data: "verify_channel" }],
    ],
  });
}

async function sendContactPrompt(chatId: number) {
  await sendTelegramMessage(chatId, "እንኳን ደህና መጣህ! አሁን ኮንታክትህን በመላክ ምዝገባህን አጠናቅቅ።", { keyboard: [[{ text: "ኮንታክቴን አጋራ", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true });
}

export function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const isAdmin = (req: express.Request) => {
    const key = process.env.ADMIN_PANEL_KEY;
    return Boolean(key && req.headers.authorization === `Bearer ${key}`);
  };

  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  app.get("/api/dashboard", async (req, res) => {
    const telegramId = Number(req.query.telegramId);
    const deviceId = String(req.query.deviceId ?? "");
    if (!Number.isSafeInteger(telegramId) || telegramId <= 0 || deviceId.length < 16 || deviceId.length > 128) {
      res.status(400).json({ error: "A valid telegramId and deviceId are required" });
      return;
    }
    try {
      const binding = await bindDevice(telegramId, deviceId);
      if (binding.referrerId) {
        await sendTelegramMessage(binding.referrerId, "እንኳን ደስ አለዎት! የጋበዙት ሰው ምዝገባውን አጠናቋል። 3 ብር ገቢ ተጨምሯል።");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "DEVICE_CONFLICT") {
        res.status(409).json({ error: "DEVICE_ALREADY_BOUND" });
        return;
      }
      throw error;
    }
    const dashboard = await getDashboard(telegramId);
    if (!dashboard) {
      res.status(404).json({ error: "User is not registered" });
      return;
    }
    const botUsername = (process.env.TELEGRAM_BOT_USERNAME ?? "@JanoEarn_bot").replace(/^@/, "");
    res.json({ ...dashboard, referralLink: botUsername ? `https://t.me/${botUsername}?start=ref_${telegramId}` : null });
  });

  app.post("/api/withdrawals", async (req, res) => {
    const telegramId = Number(req.body?.telegramId);
    const phoneNumber = String(req.body?.phoneNumber ?? "").trim();
    const accountName = String(req.body?.accountName ?? "").trim();
    const amount = Number(req.body?.amount);
    if (!Number.isSafeInteger(telegramId) || telegramId <= 0 || !/^09\d{8}$/.test(phoneNumber) || !accountName || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "Invalid withdrawal details" });
      return;
    }
    const dashboard = await getDashboard(telegramId);
    const minimumWithdrawal = await getMinimumWithdrawal();
    if (!dashboard || amount < minimumWithdrawal || amount > dashboard.referrals.total) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }
    const withdrawal = await createWithdrawal({ telegramId, phoneNumber, accountName, amount });
    const adminChatId = Number(process.env.TELEGRAM_ADMIN_CHAT_ID);
    if (Number.isSafeInteger(adminChatId) && adminChatId > 0) {
      await sendTelegramMessage(adminChatId, `የWithdrawal ጥያቄ #${withdrawal.id}\n\nተጠቃሚ: ${dashboard.user.first_name}\nTelegram ID: ${telegramId}\nTelebirr: ${phoneNumber}\nባለቤት: ${accountName}\nመጠን: ${Number(withdrawal.amount).toFixed(2)} ብር\n\nእባክዎ ይፍቀዱ ወይም ይከልክሉ።`, { inline_keyboard: [[{ text: "አጽድቅ", callback_data: `withdraw_approve:${withdrawal.id}` }, { text: "ከልክል", callback_data: `withdraw_reject:${withdrawal.id}` }]] });
    }
    res.status(201).json({ id: withdrawal.id, status: withdrawal.status });
  });

  app.get("/api/admin/withdrawals", async (req, res) => {
    if (!isAdmin(req)) {
      res.sendStatus(401);
      return;
    }
    res.json({ withdrawals: await getAdminWithdrawals(), minimumWithdrawal: await getMinimumWithdrawal() });
  });

  app.put("/api/admin/settings/minimum-withdrawal", async (req, res) => {
    if (!isAdmin(req)) {
      res.sendStatus(401);
      return;
    }
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      res.status(400).json({ error: "Invalid minimum withdrawal" });
      return;
    }
    await setMinimumWithdrawal(amount);
    res.json({ minimumWithdrawal: amount });
  });

  app.patch("/api/admin/withdrawals/:id", async (req, res) => {
    if (!isAdmin(req)) {
      res.sendStatus(401);
      return;
    }
    const id = Number(req.params.id);
    const status = req.body?.status;
    if (!Number.isSafeInteger(id) || !["approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "Invalid withdrawal update" });
      return;
    }
    const withdrawal = await updateWithdrawalStatus(id, status);
    res.json(withdrawal);
  });

  app.post("/api/telegram/webhook", async (req, res) => {
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (webhookSecret && req.headers["x-telegram-bot-api-secret-token"] !== webhookSecret) {
      res.sendStatus(401);
      return;
    }

    res.sendStatus(200);
    const update = req.body as TelegramUpdate;
    const callback = update.callback_query;
    if ((callback?.data?.startsWith("withdraw_approve:") || callback?.data?.startsWith("withdraw_reject:")) && callback.message?.chat?.id) {
      const adminChatId = Number(process.env.TELEGRAM_ADMIN_CHAT_ID);
      if (callback.from.id !== adminChatId) return;
      const [action, idText] = callback.data.split(":");
      const withdrawalId = Number(idText);
      if (!Number.isSafeInteger(withdrawalId) || !["withdraw_approve", "withdraw_reject"].includes(action)) return;
      const withdrawal = await updateWithdrawalStatus(withdrawalId, action === "withdraw_approve" ? "approved" : "rejected");
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token) await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ callback_query_id: callback.id, text: action === "withdraw_approve" ? "ጥያቄው ጸድቋል" : "ጥያቄው ተከልክሏል" }) });
      await sendTelegramMessage(callback.message.chat.id, `Withdrawal #${withdrawal.id} ${withdrawal.status === "approved" ? "ጸድቋል" : "ተከልክሏል"}።`);
      if (withdrawal.telegramId) {
        await sendTelegramMessage(Number(withdrawal.telegramId), withdrawal.status === "approved"
          ? `እንኳን ደስ አለህ! የWithdrawal ጥያቄህ #${withdrawal.id} ጸድቋል።\n\n${Number(withdrawal.amount).toFixed(2)} ብር ወደ Telebirr አካውንትህ ይላካል።`
          : `የWithdrawal ጥያቄህ #${withdrawal.id} አልጸደቀም።`);
      }
      return;
    }
    if (callback?.data === "verify_channel" && callback.message?.chat?.id) {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token) await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ callback_query_id: callback.id, text: "እያረጋገጥን ነው..." }) });
      if (!(await isChannelMember(callback.from.id))) {
        await sendJoinRequirement(callback.message.chat.id);
      } else {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (token && callback.message.message_id) {
          await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: callback.message.chat.id, message_id: callback.message.message_id, reply_markup: { inline_keyboard: [] } }),
          });
        }
        if (await getDashboard(callback.from.id)) {
        const miniAppUrl = process.env.MINI_APP_URL ?? "https://inviteearn-dashboard-i0lm.onrender.com";
        await sendTelegramMessage(callback.message.chat.id, "እንደገና እንኳን ደህና መጣህ። አፕህን ክፈት እና ስራህን ቀጥል።", {
          keyboard: [
            [miniAppUrl ? { text: "Open App", web_app: { url: miniAppUrl } } : { text: "Open App" }],
            [{ text: "ኢንቫይት" }, { text: "ዊዝድሮው" }],
            [{ text: "ሂሳብ አሳይ" }],
          ],
          resize_keyboard: true,
        });
        } else {
          await sendContactPrompt(callback.message.chat.id);
        }
      }
      return;
    }
    const message = update.message;
    const chatId = message?.chat?.id;
    if (!message || !chatId) return;

    if (message.text?.startsWith("/start")) {
      const startPayload = message.text.split(/\s+/)[1];
      const telegramId = message.from?.id ?? chatId;
      const referrerId = Number(startPayload?.replace(/^ref_/, ""));
      if (Number.isSafeInteger(referrerId) && referrerId > 0 && referrerId !== telegramId) {
        await savePendingReferral(telegramId, referrerId);
        await sendTelegramMessage(referrerId, "አዲስ ሰው የግብዣ ሊንክዎን ተጠቅሞ ወደ InviteEarn ገብቷል።\n\nምዝገባውን እስኪያጠናቅቅ ይጠብቁ፤ ከዚያ 3 ብር ገቢ ይመዘገባል።");
      }
      if (!(await isChannelMember(telegramId))) {
        await sendJoinRequirement(chatId);
        return;
      }
      const miniAppUrl = process.env.MINI_APP_URL ?? "https://inviteearn-dashboard-i0lm.onrender.com";
      const isRegistered = Boolean(await getDashboard(telegramId));
      const displayName = message.from?.username ? `@${message.from.username}` : message.from?.first_name ?? "የTelegram ተጠቃሚ";
      await sendTelegramMessage(
        chatId,
        isRegistered ? `እንደምን አለህ ${displayName}!\n\nግብዣ ይጀምሩ፣ 3 ብር በ1 ሰው ያግኙ። አፕህን ክፈት እና ስራህን ቀጥል።` : `እንደምን አለህ ${displayName}!\n\nግብዣ ይጀምሩ፣ 3 ብር በ1 ሰው ያግኙ። ምዝገባህን ለመጨረስ ኮንታክትህን ላክ።`,
        {
          keyboard: [
            [miniAppUrl ? { text: "Open App", web_app: { url: miniAppUrl } } : { text: "Open App" }],
            [{ text: "ኢንቫይት" }, { text: "ዊዝድሮው" }],
            [{ text: "ሂሳብ አሳይ" }],
            ...(!isRegistered ? [[{ text: "ኮንታክቴን አጋራ", request_contact: true }]] : []),
          ],
          resize_keyboard: true,
        },
      );
      return;
    }

    if (message.text === "Open App") {
      const miniAppUrl = process.env.MINI_APP_URL ?? "https://inviteearn-dashboard-i0lm.onrender.com";
      await sendTelegramMessage(chatId, miniAppUrl ? `Mini App ክፈት፦ ${miniAppUrl}` : "Mini App አሁን አልተዘጋጀም።");
      return;
    }

    if (message.text === "ኢንቫይት") {
      const botUsername = (process.env.TELEGRAM_BOT_USERNAME ?? "@JanoEarn_bot").replace(/^@/, "");
      await sendTelegramMessage(chatId, botUsername ? `የእርስዎ የግብዣ ሊንክ፦\nhttps://t.me/${botUsername}?start=ref_${chatId}\n\nበእያንዳንዱ ግብዣ 3 ብር ያግኙ።` : "የግብዣ ሊንክ ገና አልተዘጋጀም።");
      return;
    }

    if (message.text === "ሂሳብ አሳይ") {
      const telegramId = message.from?.id ?? chatId;
      const dashboard = await getDashboard(telegramId);
      if (!dashboard) {
        await sendTelegramMessage(chatId, "መጀመሪያ ኮንታክትዎን በመላክ ይመዝገቡ።");
      } else {
        await sendTelegramMessage(chatId, `የእርስዎ ሂሳብ፦ ${dashboard.referrals.total.toFixed(2)} ብር\n\nየተጋበዙ ሰዎች፦ ${dashboard.referrals.count}`);
      }
      return;
    }

    if (message.text === "ዊዝድሮው") {
      const telegramId = message.from?.id ?? chatId;
      const dashboard = await getDashboard(telegramId);
      if (!dashboard) {
        await sendTelegramMessage(chatId, "መጀመሪያ ኮንታክትዎን በመላክ ይመዝገቡ።");
      } else if (dashboard.referrals.total < await getMinimumWithdrawal()) {
        await sendTelegramMessage(chatId, "በቂ ባላንስ የልዎትም");
      } else {
        await saveWithdrawalSession(telegramId, { step: "phone", phoneNumber: null, accountName: null });
        await sendTelegramMessage(chatId, `ያሎት ቀሪ ሂሳብ ${(dashboard.referrals.total).toFixed(2)} ብር ነው።\n\nገንዘብ የሚቀበሉበትን የTelebirr ቁጥር ያስገቡ።`);
      }
      return;
    }

    if (message.text) {
      const telegramId = message.from?.id ?? chatId;
      const session = await getWithdrawalSession(telegramId);
      if (session?.step === "phone") {
        if (!/^09\d{8}$/.test(message.text.trim())) {
          await sendTelegramMessage(chatId, "እባክዎ ትክክለኛ የTelebirr ቁጥር ያስገቡ (09XXXXXXXX)።");
          return;
        }
        await saveWithdrawalSession(telegramId, { step: "owner", phoneNumber: message.text.trim(), accountName: null });
        await sendTelegramMessage(chatId, "የአካውንቱን ባለቤት ስም ያስገቡ።");
        return;
      }
      if (session?.step === "owner") {
        await saveWithdrawalSession(telegramId, { step: "amount", phoneNumber: session.phoneNumber, accountName: message.text.trim() });
        const dashboard = await getDashboard(telegramId);
        await sendTelegramMessage(chatId, `ማውጣት የሚፈልጉትን መጠን ያስገቡ።\n\nያሎት ቀሪ ሂሳብ: ${(dashboard?.referrals.total ?? 0).toFixed(2)} ብር`);
        return;
      }
      if (session?.step === "amount") {
        const amount = Number(message.text.trim());
        const dashboard = await getDashboard(telegramId);
        const minimumWithdrawal = await getMinimumWithdrawal();
        if (!Number.isFinite(amount) || amount < minimumWithdrawal || !dashboard || amount > dashboard.referrals.total || !session.phoneNumber || !session.accountName) {
          await sendTelegramMessage(chatId, "በቂ ባላንስ የልዎትም ወይም የገባው መጠን ትክክል አይደለም።");
          return;
        }
        const withdrawal = await createWithdrawal({ telegramId, phoneNumber: session.phoneNumber, accountName: session.accountName, amount });
        await clearWithdrawalSession(telegramId);
        const adminChatId = Number(process.env.TELEGRAM_ADMIN_CHAT_ID);
        if (Number.isSafeInteger(adminChatId) && adminChatId > 0) {
          await sendTelegramMessage(adminChatId, `የWithdrawal ጥያቄ #${withdrawal.id}\n\nተጠቃሚ: ${dashboard.user.first_name}\nTelegram ID: ${telegramId}\nTelebirr: ${session.phoneNumber}\nባለቤት: ${session.accountName}\nመጠን: ${Number(withdrawal.amount).toFixed(2)} ብር`, { inline_keyboard: [[{ text: "አጽድቅ", callback_data: `withdraw_approve:${withdrawal.id}` }, { text: "ከልክል", callback_data: `withdraw_reject:${withdrawal.id}` }]] });
        }
        await sendTelegramMessage(chatId, "ጥያቄዎ ወደአድሚን ተልኳል። በቅርቡ ወደቴሌብርዎ ገቢ ይደረጋል።");
        return;
      }
    }

    if (message.contact) {
      const telegramId = message.contact.user_id ?? message.from?.id ?? chatId;
      if (!(await isChannelMember(telegramId))) {
        await sendJoinRequirement(chatId);
        return;
      }
      const registration = await registerUser({
        telegramId,
        firstName: message.contact.first_name,
        username: message.from?.username,
        phoneNumber: message.contact.phone_number,
      });
      if (registration.referrerId) {
        await sendTelegramMessage(registration.referrerId, "እንኳን ደስ አለዎት! የጋበዙት ሰው ተመዝግቧል። 3 ብር ገቢ ተጨምሯል።");
      }
      const miniAppUrl = process.env.MINI_APP_URL ?? "https://inviteearn-dashboard-i0lm.onrender.com";
      await sendTelegramMessage(
        chatId,
        `እንኳን ደህና መጣህ ${message.contact.first_name}! ምዝገባህ ተሳክቷል።\n\nአሁን የግብዣ ሊንክህን ተጠቅመህ ጓደኞችህን ጋብዝ። ለእያንዳንዱ ሰው 3 ብር ታገኛለህ።`,
        {
          keyboard: [
            [miniAppUrl ? { text: "Open App", web_app: { url: miniAppUrl } } : { text: "Open App" }],
            [{ text: "ኢንቫይት" }, { text: "ዊዝድሮው" }],
            [{ text: "ሂሳብ አሳይ" }],
          ],
          resize_keyboard: true,
        },
      );
    }
  });

  return app;
}
