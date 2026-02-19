---
trigger: always_on
---

# MealQuest Private Domain Rules

You are designing a **Private Domain SaaS**, NOT a Public Platform. 
You must strictly adhere to the following **"De-Platforming"** rules to protect Merchant Sovereignty.

## 0. 🚨 ABSOLUTE SOURCE OF TRUTH
*   **ALWAYS** strictly adhere to the latest version of the specification documents (including `MealQuest_Spec.md`, `MealQuest_Customer_Spec.md`, `MealQuest_Merchant_Spec.md`).
*   **NO MODIFICATIONS OR ADDITIONS** are permitted unless the specification documents are updated first.
*   The Spec Documents are the "Law"; Code and Implementation are merely the "Execution".

## 1. 🚫 THE "NO MALL" PRINCIPLE
*   **NEVER** design a "Store List" or "Nearby Merchants" page.
*   **NEVER** allow users to "Browse" or "Search" for other stores.
*   **NEVER** provide a "Back to Homepage" button that exits the current store context.
*   **RATIONALE**: Our merchants own their traffic. Providing an exit to a competitor (even if just a list) is a betrayal of the SaaS value proposition.

## 2. 🔒 THE "BLACK HOLE" ENTRY STRATEGY
*   **Cold Start**: If a user has no history, the ONLY permitted UI is a **[Scan QR Code]** button.
*   **Warm Start**: If a user has history, **IMMEDIATELY** load the **[Last Visited Store]**.
*   **Context**: The App must behave as if it is **"The Store's Exclusive App"**, not the "MealQuest App".

## 3. 📍 LBS IS A LOCK, NOT A MAP
*   **Verification Only**: GPS/LBS is used ONLY to verify "Is the user currently at the table?" (Anti-cheat/Verification).
*   **No Discovery**: **NEVER** use LBS to show "What's good around here?".

## 4. 🎨 BRANDING MIMICRY
*   **Header/Title**: Must display the **Merchant's Name**, not "MealQuest".
*   **Theme**: The UI color/style should adapt to the Merchant's configuration.
*   **Tone**: System notifications should speak as "The Shopkeeper", not "The Platform Admin".

## 5. 🛑 CRITICAL CHECKLIST
- [ ] Did I inadvertently create a navigation bar that leads out of the store? -> **DELETE IT.**
- [ ] Did I suggest a "Search Stores" feature? -> **DELETE IT.**
- [ ] Did I design a "Platform Home" page? -> **DELETE IT.**
- [ ] Am I respecting the "Single Store Isolation" model? -> **YES.**

## 6. 🛠️ TESTING PROTOCOL
*   **NO AUTO-TESTING**: Do NOT initiate automated browser testing unless explicitly requested by the user.
*   **COMPLY WITH TESTING SPECS**: Strictly adhere to the **Testing Pyramid** strategy defined in `MealQuest_Customer_Spec.md`.