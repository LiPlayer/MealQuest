---
trigger: always_on
---

# MealQuest Private Domain Rules (私域独占性原则)

You are designing a **Private Domain SaaS (私域流量工具)**, NOT a Public Platform (公域流量平台).
You must strictly adhere to the following **"De-Platforming" (去平台化)** rules to protect Merchant Sovereignty.

## 0. 🚨 ABSOLUTE SOURCE OF TRUTH (文档即法律)
*   **ALWAYS** strictly adhere to the latest version of the specification documents (including `MealQuest_Spec.md`, `MealQuest_Customer_Spec.md`, `MealQuest_Merchant_Spec.md`).
*   **NO MODIFICATIONS OR ADDITIONS** are allowed unless the specification documents are updated first.
*   The Spec Documents are the "Law"; Code and Implementation are merely the "Execution".

## 1. 🚫 THE "NO MALL" PRINCIPLE (严禁商城模式)
*   **NEVER** design a "Store List" or "Nearby Merchants" page.
*   **NEVER** allow users to "Browse" or "Search" for other stores.
*   **NEVER** provide a "Back to Homepage" button that exits the current store context.
*   **REASON**: Our merchants own their traffic. Providing an exit to a competitor (even if just a list) is a betrayal of the SaaS value proposition.

## 2. 🔒 THE "BLACK HOLE" ENTRY STRATEGY (黑洞入口)
*   **Cold Start**: If a user has no history, the ONLY allowed UI is a **[Scan QR Code]** button.
*   **Warm Start**: If a user has history, **IMMEDIATELY** load the **[Last Visited Store]**.
*   **Context**: The App must behave as if it is **"The Store's Exclusive App"**, not "MealQuest App".

## 3. 📍 LBS IS A LOCK, NOT A MAP (LBS 仅作为锁)
*   **Verification Only**: GPS/LBS is used ONLY to verify "Is the user currently at the table?" (Anti-cheat).
*   **No Discovery**: **NEVER** use LBS to show "What's good around here?".

## 4. 🎨 BRANDING MIMICRY (拟态保护)
*   **Header/Title**: Must display the **Merchant's Name**, not "MealQuest".
*   **Theme**: The UI color/style should adapt to the Merchant's configuration.
*   **Tone**: System notifications speak as "The Shopkeeper", not "The Platform Admin".

## 5. 🛑 CRITICAL CHECKLIST (每次生成代码前必查)
- [ ] Did I inadvertently create a navigation bar that leads out of the store? -> **DELETE IT.**
- [ ] Did I suggest a "Search Stores" feature? -> **DELETE IT.**
- [ ] Did I design a "Platform Home" page? -> **DELETE IT.**
- [ ] Am I respecting the "Single Store Isolation" model? -> **YES.**
