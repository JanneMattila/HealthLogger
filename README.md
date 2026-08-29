# HealthLogger

A comprehensive calorie intake and wellness tracking application built with ASP.NET Core and vanilla JavaScript. Designed for Finnish users with data from Fineli® (THL).

## Features

- **Meal Logging** — Search Finnish foods (Fineli database), log meals with portions
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

## License

MIT

## Attribution

Data source: Fineli®, THL (CC-BY 4.0)
