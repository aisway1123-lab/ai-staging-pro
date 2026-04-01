// api/newebpay-create.js
// 建立藍新金流訂單

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const MERCHANT_ID  = process.env.NEWEBPAY_MERCHANT_ID || 'MS1825863020';
const HASH_KEY     = process.env.NEWEBPAY_HASH_KEY;
const HASH_IV      = process.env.NEWEBPAY_HASH_IV;
const SITE_URL     = process.env.SITE_URL || 'https://ai-staging-pro-puce.vercel.app';

// 方案定義
const PLANS = {
  mini_monthly:     { name: 'AI Staging Pro 迷你月費', amount: 899,  credits: 300,  type: 'subscription' },
  standard_monthly: { name: 'AI Staging Pro 標準月費', amount: 1980, credits: 1000, type: 'subscription' },
  mini_yearly:      { name: 'AI Staging Pro 迷你年費', amount: 8990, credits: 3600, type: 'subscription' },
  standard_yearly:  { name: 'AI Staging Pro 標準年費', amount: 19800,credits: 12000,type: 'subscription' },
  credits_100:      { name: 'AI Staging Pro 入門點數包', amount: 390,  credits: 100,  type: 'credits' },
  credits_300:      { name: 'AI Staging Pro 標準點數包', amount: 990,  credits: 300,  type: 'credits' },
  credits_600:      { name: 'AI Staging Pro 超值點數包', amount: 1680, credits: 600,  type: 'credits' },
};

function aesEncrypt(data, key, iv) {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function generateShaHash(data, key, iv) {
  const str = `HashKey=${key}&${data}&HashIV=${iv}`;
  return crypto.createHash('sha256').update(str).digest('hex').toUpperCase();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { planId, userId, userEmail } = req.body;
  if (!planId || !userId) return res.status(400).json({ error: '缺少必要參數' });

  const plan = PLANS[planId];
  if (!plan) return res.status(400).json({ error: '無效的方案' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 建立訂單號碼（時間戳 + 隨機）
  const orderNo = `ASP${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

  // 寫入訂單
  const { error: orderErr } = await supabase.from('orders').insert({
    user_id:   userId,
    order_no:  orderNo,
    plan_type: planId,
    amount:    plan.amount,
    credits:   plan.credits,
    status:    'pending'
  });

  if (orderErr) return res.status(500).json({ error: '建立訂單失敗' });

  // 組成藍新交易參數
  const tradeInfo = new URLSearchParams({
    MerchantID:     MERCHANT_ID,
    RespondType:    'JSON',
    TimeStamp:      Math.floor(Date.now() / 1000).toString(),
    Version:        '2.0',
    MerchantOrderNo: orderNo,
    Amt:            plan.amount.toString(),
    ItemDesc:       plan.name,
    Email:          userEmail || '',
    NotifyURL:      `${SITE_URL}/api/newebpay-webhook`,
    ReturnURL:      `${SITE_URL}/payment-result.html`,
    ClientBackURL:  `${SITE_URL}/pricing.html`,
    CREDIT:         '1',  // 信用卡
    ANDROIDPAY:     '1',  // Google Pay
    APPLEPAY:       '1',  // Apple Pay
  }).toString();

  const encryptedTradeInfo = aesEncrypt(tradeInfo, HASH_KEY, HASH_IV);
  const tradeSha = generateShaHash(encryptedTradeInfo, HASH_KEY, HASH_IV);

  return res.status(200).json({
    success: true,
    orderNo,
    formData: {
      MerchantID:  MERCHANT_ID,
      TradeInfo:   encryptedTradeInfo,
      TradeSha:    tradeSha,
      Version:     '2.0',
    },
    // 測試環境用 sandbox，正式環境用 payment
    paymentUrl: 'https://ccore.newebpay.com/MPG/mpg_gateway'  // 測試環境
    // paymentUrl: 'https://core.newebpay.com/MPG/mpg_gateway'  // 正式環境
  });
}
