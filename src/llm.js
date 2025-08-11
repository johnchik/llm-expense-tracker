/**
 * LLM.gs - Contains all LLM-related logic for transaction classification and parsing
 */

function classifyAndParseLLM(text, title, fromApp, timestamp) {
  try {
    const system_prompt = buildSystemPrompt();
    const prompt = buildUserPrompt(text, title, fromApp, timestamp);
    const response = callLLMAPI(system_prompt, prompt);
    let cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const parsed = JSON.parse(cleanResponse);
    
    if (parsed.type === 'transaction') {
      return {
        type: 'transaction',
        datetime: parsed.datetime || formatDate(new Date()),
        category: parsed.category || 'Other',
        description: parsed.description || title,
        currency: parsed.currency || 'HKD',
        amount: parsed.amount || 0,
        paymentMethod: parsed.paymentMethod || fromApp,
        rawText: text
      };
    } else if (parsed.type === 'stock_trading') {
      return {
        type: 'stock_trading',
        action: parsed.action,
        ticker: parsed.ticker,
        shares: parsed.shares,
        price: parsed.price,
        rawText: text,
        datetime: formatDate(new Date())
      };
    } else {
      return {
        type: parsed.type || 'other',
        message: parsed.message || 'Non-transaction notification'
      };
    }
    
  } catch (error) {
    console.error('LLM call failed:', error);
    
    // Fallback: assume it's a transaction if parsing fails
    return {
      type: 'transaction',
      datetime: formatDate(new Date()),
      category: 'Other',
      description: title,
      currency: 'HKD',
      amount: 0,
      paymentMethod: fromApp,
      rawText: text
    };
  }
}

function buildSystemPrompt(text, title, fromApp, timestamp) {
  return 'You will receive a notification farward from mobile phone financial apps/emails/sms.'+'\n' +
'The format of the incoming notification looks like:'+'\n' +
'App Name: (The notification which was sent by this app)'+'\n' +
'Title: (The title of this notification)'+'\n' +
'Text: (The detailed body of this notification)'+'\n' +
'Timestamp: (The date and time of this notification)'+'\n' +
''+'\n' +
'The Apps Name include:'+'\n' +
'- Financial Apps (Direct notification from E wallets/Banks)'+'\n' +
'- Gmail (emails from E wallets/Banks)'+'\n' +
'- Messages (SMS from E wallets/Banks)'+'\n' +
''+'\n' +
'Rules:'+'\n' +
'1. Determine the notification type. It can be "transaction", "stock_trading", or a non-transaction type.'+'\n' +
'Return ONLY a JSON object based on the type.'+'\n' +
'"transaction" means money I spend, money I transfer to others, money I received from others. There must be explicit amount recorded in notification text or title.'+'\n' +
'"stock_trading" means I buy or sell stock shares.'+'\n' +
'Non-transaction types are for promotions, security alerts, balance inquiries, verification messages, etc.'+'\n' +
'  - Verification Message Example: "💳 輕按此處以驗證你的Mox卡尾XXXX..." is a "security_alert".'+'\n' +
''+'\n' +
'- You output JSON body for "transaction":'+'\n' +
'{'+'\n' +
'  "type": "transaction",'+'\n' +
'  "datetime": "YYYY-MM-DD HH:mm",'+'\n' +
'  "category": "Food|Shopping|Transport|Entertainment|Bills|Other|Income",'+'\n' +
'  "description": "Concise merchant name, payee(for - money) or payer(for + money), or leave it empty string if no enough info from notification",'+'\n' +
'  "currency": "Currency code (HKD, CNY, JPY, USD, etc)",'+'\n' +
'  "amount": "number with + for income, - for expenses",'+'\n' +
'  "paymentMethod": "Normalize payment (see mapping table below)"'+'\n' +
'}'+'\n' +
''+'\n' +
'- You output JSON body for "stock_trading":'+'\n' +
'{'+'\n' +
'  "type": "stock_trading",'+'\n' +
'  "action": "Purchase|Sell|Cancel|Unexecuted",'+'\n' +
'  "ticker": "Stock symbol (e.g., GOOGL, TSM, NVDA)",'+'\n' +
'  "shares": "Number of shares",'+'\n' +
'  "price": "Price per share (number, optional)"'+'\n' +
'}'+'\n' +
'- You output JSON body for NON-TRANSACTIONS (anything else):'+'\n' +
'{'+'\n' +
'  "type": "promotion|security_alert|balance_inquiry|other",'+'\n' +
'  "message": "Brief explanation of the notification"'+'\n' +
'}'+'\n' +
''+'\n' +
'2. Mapping Table for payment method'+'\n' +
'|Terms|Normalized Payment Method|'+'\n' +
'|八達通|Octopus|'+'\n' +
'|PayMe|PayMe|'+'\n' +
'|支付寶香港|AlipayHK|'+'\n' +
'|信用卡尾號0018|BOCHK CHILL|'+'\n' +
'|ZA|ZA Bank|'+'\n' +
'|Mox|Mox Bank|'+'\n' +
'|HSBC|HSBC|'+'\n' +
'|SOGO VS|SOGO VS|'+'\n' +
''+'\n' +
'Example Input 1:'+'\n' +
'App Name: Octopus'+'\n' +
'Title: Android版八達通'+'\n' +
'Text: 八達通: 在 港鐵 支付HKD5.9。餘額: HKD 100.1'+'\n' +
'Timestamp: 2025/07/01 06:00'+'\n' +
''+'\n' +
'Expected JSON Output 1:'+'\n' +
'{'+'\n' +
'  "type": "transaction",'+'\n' +
'  "datetime": "2025-07-01 06:00",'+'\n' +
'  "category": "Transport",'+'\n' +
'  "description": "港鐵",'+'\n' +
'  "currency": "HKD",'+'\n' +
'  "amount": "-5.9",'+'\n' +
'  "paymentMethod": "Octopus",'+'\n' +
'}'+'\n' +
''+'\n' +
'Example Input 2:'+'\n' +
'App Name: Messages'+'\n' +
'Title: #HSBC'+'\n' +
'Text: HSBC:  PUR 4 SHS TSM AT USD229.60, TOT PUR 4 SHS, O/S 0. P123456'+'\n' +
'Timestamp: 2025/07/11 02:00'+'\n' +
''+'\n' +
'Expected JSON Output 2:'+'\n' +
'{'+'\n' +
'  "type": "stock_trading",'+'\n' +
'  "action": "Purchase",'+'\n' +
'  "ticker": "TSM",'+'\n' +
'  "shares": "4",'+'\n' +
'  "price": "229.60"'+'\n' +
'}'+'\n' +
'Possible Examples of stock trading messages:'+'\n' +
'- "HSBC:  CANCEL PUR 3 SHS GOOGL, TOT PUR 0 SHS. P123465" -> action: "Cancel", ticker: "GOOGL", shares: 3'+'\n' +
'- "HSBC:  SOLD 4 SHS TSM AT USD220.00, TOT SOLD 4 SHS, O/S 0. S123456" -> action: "Sell", ticker: "TSM", shares: 4, price: 220.00'+'\n' +
'- "HSBC:  UNEXE SELL 4 SHS NVDA, ORDER CANCELLED. S123456" -> action: "Unexecuted", ticker: "NVDA", shares: 4'+'\n' +
''+'\n' +
'Example Input 3:'+'\n' +
'App Name: Mox'+'\n' +
'Title: Mox Bank'+'\n' +
'Text: 💳 輕按此處以驗證你的Mox卡尾1234於2025-07-21 11:20:00HKT 在Driving Test Book的網上交易HKD510.00。如懷疑電28888228或經Mox App聯絡我們。'+'\n' +
'Timestamp: 2025-07-21 11:20'+'\n' +
''+'\n' +
'Expected JSON Output 3:'+'\n' +
'{'+'\n' +
'  "type": "security_alert",'+'\n' +
'  "message": "The transaction is not done. This is a notification that ask for verification."'+'\n' +
'}'+'\n';
}

function buildUserPrompt(text, title, fromApp, timestamp) {
  return 'App Name: '+fromApp+'\n' +
'Title: '+title+'\n' +
'Text: '+text+'\n' +
'Timestamp: '+timestamp+'\n\n' +
'Your JSON output:';
}

function callLLMAPI(system_prompt, prompt) {
  const LLM_API_KEY = getSecret('LLM_API_KEY');
  const LLM_API_ENDPOINT = getSecret('LLM_API_ENDPOINT');

  console.log(system_prompt);
  console.log(prompt);
  const response = UrlFetchApp.fetch(LLM_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + LLM_API_KEY,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({
      model: 'openai/gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: system_prompt
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 300,
      temperature: 0.1
    })
  });
  
  const data = JSON.parse(response.getContentText());
  return data.choices[0].message.content.trim();
}