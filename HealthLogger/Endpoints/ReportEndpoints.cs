using HealthLogger.Extensions;
using HealthLogger.Services;

namespace HealthLogger.Endpoints;

public static class ReportEndpoints
{
    public static void MapReportEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/reports").RequireAuthorization();

        group.MapGet("/export", async (HttpContext ctx, ReportService reportService) =>
        {
            ctx.Response.Headers.CacheControl = "no-store";
            var text = await reportService.GenerateTextExportAsync(ctx.GetAppUserId());
            return Results.File(text, "text/plain; charset=utf-8", $"HealthLogger-data-{DateTime.UtcNow:yyyy-MM-dd}.txt");
        });

        group.MapGet("/weekly", async (DateOnly? date, HttpContext ctx, ReportService reportService) =>
        {
            var userId = ctx.GetAppUserId();
            var weekStart = date ?? DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-(int)DateTime.UtcNow.DayOfWeek + 1);
            var pdf = await reportService.GenerateWeeklyReportAsync(userId, weekStart);
            return Results.File(pdf, "application/pdf", $"HealthLogger-weekly-{weekStart:yyyy-MM-dd}.pdf");
        });
    }
}
