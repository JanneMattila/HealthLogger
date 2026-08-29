# Health Logger Repository Instructions

- Keep the application running while making changes. Start it with `dotnet run --project HealthLogger/HealthLogger.csproj` when it is not already running, and leave the browser open on the main page after validation.
- After changing frontend JavaScript or other versioned static assets, run `.\deploy-js-update.ps1` from the repository root so the service worker and asset cache versions are updated.
- To deploy app, first close the running app and then use `.\deploy-to-azure.ps1` from the repository root.
- Before committing changes, run `.\reset-js-version.ps1` from the repository root to ensure the service worker and asset cache versions are reset.