# HealthLogger

A comprehensive calorie intake and wellness tracking application built with ASP.NET Core and vanilla JavaScript. Designed for Finnish users with data from Fineli® (THL).

## Features

- **Drink logging:** Drinks use the ingredient consumption dialog with nutrition above the amount controls, volume units and drink presets. The dialog fills mobile screens and stays centered on desktop. Custom drinks are selected or entered before choosing the amount and confirming consumption. Saved drink favorites open directly with their nutrition: database drinks load their current food record, and manually entered drinks retain their nutrition locally. Older manual favorites restore the energy and macros previously saved; nutrient values not saved by older versions remain unavailable.
- **Meal Logging** — Search Finnish foods (Fineli database), log meals with portions
- **History:** Browse any date using a week, month or year calendar, or enter a date directly. History reuses Today's nutrition totals, meal groups and nutrient breakdowns for the selected day. Dates are shareable via `/history?date=YYYY-MM-DD`; adding a meal from History carries the selected date into the meal editor. The calendar navigation is inspired by [GymLogger](https://github.com/JanneMattila/GymLogger).
- **Meal save confirmation:** Save meal displays the selected date, time, ingredients, total weight, calories, protein, fat and carbohydrates before recording the meal. Cancel returns to the unchanged draft; failed saves remain available for retry.
- **Meal ingredient search:** Meals and Ingredients share a locally cached food list, so subsequent searches avoid server requests. Adding a recipe from the meal editor saves that recipe with the selected meal date, time and type without leaving the editor or discarding its ingredient draft. Recipes added from other views retain their existing Dashboard navigation.
- 📸 **AI Food Recognition** — Take a photo, Azure OpenAI identifies ingredients
- 🛏️ **Daily Wellness Check-ins** — Sleep, mood, energy, stress, water, exercise, alcohol, steps
- ⚖️ **Body Metrics** — Weight, waist circumference (vatsanympärysmitta), blood pressure
- 🥪 **Custom Recipes** — Build reusable meal combos
- 📊 **Statistics & Trends** — Calorie trends, macro breakdown, wellness correlations (Chart.js)
- 📄 **PDF Reports** — Weekly reports via QuestPDF
- 🌐 **Bilingual** — Finnish primary, English available
- 📱 **PWA** — Installable, offline support with IndexedDB
- 🔐 **Multi-user** — Microsoft Entra ID authentication

## Tech Stack

- **Backend:** ASP.NET Core 10.0 (Minimal APIs)
- **Database:** SQL Server / SQLite
- **ORM:** Entity Framework Core
- **Frontend:** Vanilla JavaScript (ES6+)
- **Charts:** Chart.js
- **AI:** Azure OpenAI GPT-4o Vision
- **Reports:** QuestPDF
- **Authentication:** Microsoft Entra ID with OpenID Connect
- **Offline:** IndexedDB + Service Worker

## Food Data Source

Data sourced from **Fineli® — National Food Composition Database**, maintained by Finnish Institute for Health and Welfare (THL). Licensed under CC-BY 4.0.

## Quick Start

### Prerequisites

- .NET 10.0 SDK
- SQL Server (LocalDB, Docker, or full installation)

### Development Setup

```powershell
cd HealthLogger
dotnet restore
dotnet ef database update
dotnet run
```

Navigate to `https://localhost:5001` or the URL shown in the terminal.

### Docker (SQL Server)

```powershell
docker-compose up -d
```

### Configuration

Update `appsettings.json` for:
- **Database:** SqlServer or SQLite connection string
- **Azure AD:** Client ID and secret for Entra ID auth
- **Azure OpenAI:** Endpoint and API key for food photo recognition

```json
{
  "AzureAd": {
    "Instance": "https://login.microsoftonline.com/",
    "TenantId": "consumers",
    "ClientId": "YOUR_CLIENT_ID",
    "ClientSecret": "YOUR_CLIENT_SECRET"
  },
  "AccessControl": {
    "AllowedTenantIds": "TENANT_ID_1,TENANT_ID_2",
    "AllowedUserIds": "USER_OBJECT_ID_1,USER_OBJECT_ID_2"
  },
  "AzureOpenAI": {
    "Endpoint": "https://your-resource.openai.azure.com/",
    "ApiKey": "YOUR_API_KEY",
    "DeploymentName": "gpt-4o"
  }
}
```

The access-control values are comma- or semicolon-separated allow lists. Both filters are applied when both are configured. Leave either value empty to disable that filter. In environment variables, use `AccessControl__AllowedTenantIds` and `AccessControl__AllowedUserIds`.

Use **User Secrets** for local development:
```powershell
dotnet user-secrets set "AzureAd:ClientId" "YOUR_CLIENT_ID"
dotnet user-secrets set "AzureOpenAI:ApiKey" "YOUR_API_KEY"
```

## Tests

Run `npm test` for the browser and export checks. To reuse an already-running app in PowerShell:

```powershell
$env:HEALTH_LOGGER_URL = "http://localhost:5188"
npm test
```

Tests fail fast: browser actions wait at most 3 seconds, navigation 5 seconds, browser launch 10 seconds, and export backend checks 75 seconds, including any rebuild after server changes. The runner limits each test file to 90 seconds and the full run to 3 minutes, including startup (limited to 45 seconds). Timed-out process trees are stopped, with up to 5 seconds allowed for cleanup. The runner stops at the first failure and never shuts down an app supplied through `HEALTH_LOGGER_URL`.

## License

MIT

## Attribution

Data source: Fineli®, THL (CC-BY 4.0)
