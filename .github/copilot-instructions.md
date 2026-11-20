# Health Logger Repository Instructions

- Keep the application running while making changes. Start it with `dotnet run --project HealthLogger/HealthLogger.csproj` when it is not already running, and leave the browser open on the main page after validation.
- After changing frontend JavaScript or other versioned static assets, run `.\deploy-js-update.ps1` from the repository root so the service worker and asset cache versions are updated.
- To deploy app, first close the running app and then use `.\deploy-to-azure.ps1` from the repository root.
- Before committing changes, run `.\reset-js-version.ps1` from the repository root to ensure the service worker and asset cache versions are reset.
- The database is SQL Server, configured through the `SqlServer` connection string. Do not use or add SQLite (no SQLite providers, packages, connection strings, or test databases).
- On Windows, use SQL Server LocalDB (`Server=(localdb)\MSSQLLocalDB`), which is the default in `appsettings.json`. Do not use Docker on Windows.
- On Linux, run SQL Server in Docker (LocalDB is Windows-only). Only the database runs in Docker; run the app and tests directly with `dotnet`/`npm`.
  - Start it if not already running (check `docker info` first and start the daemon if needed):
    `docker run -d --name HealthLogger-sqlserver -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD='YourStrong@Passw0rd' -e MSSQL_PID=Developer -p 1433:1433 mcr.microsoft.com/mssql/server:2022-latest`
    (use `docker start HealthLogger-sqlserver` if the container already exists).
  - Point the app and `tests/ExportChecks` at it with environment variables:
    `ConnectionStrings__SqlServer='Server=localhost,1433;Database=HealthLogger;User Id=sa;Password=YourStrong@Passw0rd;TrustServerCertificate=True'` and
    `HEALTHLOGGER_TEST_SQLSERVER='Server=localhost,1433;Database=HealthLoggerExportChecks;User Id=sa;Password=YourStrong@Passw0rd;TrustServerCertificate=True'`.
