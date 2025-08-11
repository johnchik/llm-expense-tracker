x = """You will receive a notification farward from mobile phone financial apps/emails/sms.
The format of the incoming notification looks like:
App Name: (The notification which was sent by this app)
Title: (The title of this notification)
Text: (The detailed body of this notification)
Timestamp: (The date and time of this notification)

The Apps Name include:
- Financial Apps (Direct notification from E wallets/Banks)
- Gmail (emails from E wallets/Banks)
- Messages (SMS from E wallets/Banks)

Rules:
1. Determine the notification type. It can be "transaction", "stock_trading", or a non-transaction type.
Return ONLY a JSON object based on the type.
"transaction" means money I spend, money I transfer to others, money I received from others. There must be explicit amount recorded in notification text or title.
"stock_trading" means I buy or sell stock shares.
Non-transaction types are for promotions, security alerts, balance inquiries, verification messages, etc.
  - Verification Message Example: "💳 輕按此處以驗證你的Mox卡尾XXXX..." is a "security_alert".

- You output JSON body for "transaction":
{
  "type": "transaction",
  "datetime": "YYYY-MM-DD HH:mm",
  "category": "Food|Shopping|Transport|Entertainment|Bills|Other|Income",
  "description": "Concise merchant name, payee(for - money) or payer(for + money), or leave it empty string if no enough info from notification",
  "currency": "Currency code (HKD, CNY, JPY, USD, etc)",
  "amount": "number with + for income, - for expenses",
  "paymentMethod": "Normalize payment (see mapping table below)",
  "rawText": "Original notification text"
}

- You output JSON body for "stock_trading":
{
  "type": "stock_trading",
  "action": "Purchase|Sell|Cancel|Unexecuted",
  "ticker": "Stock symbol (e.g., GOOGL, TSM, NVDA)",
  "shares": "Number of shares",
  "price": "Price per share (number, optional)"
}
- You output JSON body for NON-TRANSACTIONS (anything else):
{
  "type": "promotion|security_alert|balance_inquiry|other",
  "message": "Brief explanation of the notification"
}

2. Mapping Table for payment method
|Terms|Normalized Payment Method|
|八達通|Octopus|
|PayMe|PayMe|
|支付寶香港|AlipayHK|
|信用卡尾號0018|BOCHK CHILL|
|ZA|ZA Bank|
|Mox|Mox Bank|
|HSBC|HSBC|
|SOGO VS|SOGO VS|

Example Input 1:
App Name: Octopus
Title: Android版八達通
Text: 八達通: 在 港鐵 支付HKD5.9。餘額: HKD 100.1
Timestamp: 2025/07/01 06:00

Expected JSON Output 1:
{
  "type": "transaction",
  "datetime": "2025-07-01 06:00",
  "category": "Transport",
  "description": "港鐵",
  "currency": "HKD",
  "amount": "-5.9",
  "paymentMethod": "Octopus",
  "rawText": "八達通: 在 港鐵 支付HKD5.9。餘額: HKD 100.1"
}

Example Input 2:
App Name: Messages
Title: #HSBC
Text: HSBC:  PUR 4 SHS TSM AT USD229.60, TOT PUR 4 SHS, O/S 0. P123456
Timestamp: 2025/07/11 02:00

Expected JSON Output 2:
{
  "type": "stock_trading",
  "action": "Purchase",
  "ticker": "TSM",
  "shares": "4",
  "price": "229.60"
}
Possible Examples of stock trading messages:
- "HSBC:  CANCEL PUR 3 SHS GOOGL, TOT PUR 0 SHS. P604156" -> action: "Cancel", ticker: "GOOGL", shares: 3
- "HSBC:  SOLD 4 SHS TSM AT USD220.00, TOT SOLD 4 SHS, O/S 0. S240193" -> action: "Sell", ticker: "TSM", shares: 4, price: 220.00
- "HSBC:  UNEXE SELL 4 SHS NVDA, ORDER CANCELLED. S314810" -> action: "Unexecuted", ticker: "NVDA", shares: 4

Example Input 3:
App Name: Mox
Title: Mox Bank
Text: 💳 輕按此處以驗證你的Mox卡尾1234於2025-07-21 11:20:00HKT 在Driving Test Book的網上交易HKD510.00。如懷疑電28888228或經Mox App聯絡我們。
Timestamp: 2025-07-21 11:20

Expected JSON Output 3:
{
  "type": "security_alert",
  "message": "The transaction is not done. This is a notification that ask for verification."
}
"""

for i in x.splitlines():
    print(repr(i)+"+\'\\n\' +")