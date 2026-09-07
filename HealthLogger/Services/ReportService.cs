using HealthLogger.Data;
using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace HealthLogger.Services;

public class ReportService
{
    private readonly HealthLoggerDbContext _db;

    public ReportService(HealthLoggerDbContext db) => _db = db;

    public async Task<byte[]> GenerateTextExportAsync(string userId)
    {
        var id = Guid.Parse(userId);
        var checkins = await _db.DailyCheckins.AsNoTracking()
            .Where(checkin => checkin.UserId == id)
            .OrderBy(checkin => checkin.CheckinDate).ThenBy(checkin => checkin.CreatedAt).ThenBy(checkin => checkin.Id)
            .ToListAsync();
        var metrics = await _db.BodyMetrics.AsNoTracking()
            .Where(metric => metric.UserId == id)
            .OrderBy(metric => metric.MeasurementDate).ThenBy(metric => metric.CreatedAt).ThenBy(metric => metric.Id)
            .ToListAsync();
        var entries = await _db.FoodEntries.AsNoTracking()
            .Include(entry => entry.Items).ThenInclude(item => item.FoodItem)
            .Where(entry => entry.UserId == id)
            .OrderBy(entry => entry.EntryDate).ThenBy(entry => entry.ConsumptionTime)
            .ThenBy(entry => entry.CreatedAt).ThenBy(entry => entry.Id)
            .ToListAsync();

        var text = new StringBuilder();
        text.AppendLine("Health Logger - Data Export");
        text.AppendLine("Oldest first. Dates are logged dates. Check-in and metric times are recorded times in UTC, not event times.");
        text.AppendLine("Food times are consumption times as entered; missing times sort first within a date. '-' means not recorded.");
        text.AppendLine("Text cells escape backslashes, pipes, tabs and line breaks as \\\\, \\|, \\t, \\r and \\n.");

        void Row(params object?[] values)
        {
            var cells = values.Select(value => value switch
            {
                null => "-",
                DateOnly date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                TimeOnly time => time.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
                bool boolean => boolean ? "Yes" : "No",
                IFormattable formatted => formatted.ToString(null, CultureInfo.InvariantCulture),
                _ => value.ToString() ?? ""
            }).Select(value => value.Replace("\\", "\\\\").Replace("|", "\\|")
                .Replace("\t", "\\t").Replace("\r", "\\r").Replace("\n", "\\n"));
            text.AppendLine($"| {string.Join(" | ", cells)} |");
        }

        void Table(string title, params string[] columns)
        {
            text.AppendLine();
            text.AppendLine(title);
            Row(columns.Cast<object?>().ToArray());
            Row(columns.Select(_ => (object?)"---").ToArray());
        }

        Table("Rating scales (1-5; higher means better wellbeing)", "Rating", "1", "2", "3", "4", "5");
        Row("Sleep quality", "Very poor", "Poor", "Fair", "Good", "Excellent");
        Row("Mood", "Very low", "Low", "Neutral", "Good", "Excellent");
        Row("Energy", "Exhausted", "Low", "Moderate", "High", "Very energetic");
        Row("Stress", "Extreme", "High", "Moderate", "Low", "No stress");

        Table("Check-ins", "Date", "Recorded time (UTC)", "Sleep quality (1-5)", "Sleep (hours)",
            "Mood (1-5)", "Energy (1-5)", "Stress (1-5)", "Water (L)", "Exercise done", "Exercise type",
            "Alcohol (units)", "Steps", "Notes");
        foreach (var checkin in checkins)
        {
            Row(checkin.CheckinDate, TimeOnly.FromDateTime(checkin.CreatedAt), checkin.SleepQuality,
                checkin.SleepHours, checkin.MoodRating, checkin.EnergyLevel, checkin.StressLevel,
                checkin.WaterIntakeLiters, checkin.ExerciseDone, checkin.ExerciseType,
                checkin.AlcoholUnits, checkin.StepCount, checkin.Notes);
        }

        Table("Metrics", "Date", "Recorded time (UTC)", "Weight (kg)", "Waist (cm)",
            "Systolic BP (mmHg)", "Diastolic BP (mmHg)", "Notes");
        foreach (var metric in metrics)
        {
            Row(metric.MeasurementDate, TimeOnly.FromDateTime(metric.CreatedAt), metric.WeightKg,
                metric.WaistCircumferenceCm, metric.SystolicBP, metric.DiastolicBP, metric.Notes);
        }

        Table("Food", "Date", "Consumption time", "Meal", "Food (English)", "Food (Finnish)", "Portion (g)",
            "Calories (kcal)", "Protein (g)", "Fat (g)", "Carbohydrate (g)", "Source recipe", "Item notes", "Meal notes");
        foreach (var entry in entries)
        {
            if (entry.Items.Count == 0)
                Row(entry.EntryDate, entry.ConsumptionTime, entry.MealType, null, null, null,
                    entry.TotalCalories, null, null, null, null, null, entry.Notes);
            foreach (var item in entry.Items.OrderBy(item => item.CreatedAt).ThenBy(item => item.Id))
            {
                Row(entry.EntryDate, entry.ConsumptionTime, entry.MealType,
                    item.FoodItem?.NameEn ?? item.SourceRecipeName ?? item.Notes, item.FoodItem?.NameFi,
                    item.PortionGrams, item.CustomCalories ?? item.FoodItem?.EnergyKcal * item.PortionGrams / 100,
                    item.FoodItem?.Protein * item.PortionGrams / 100, item.FoodItem?.Fat * item.PortionGrams / 100,
                    item.FoodItem?.Carbohydrate * item.PortionGrams / 100, item.SourceRecipeName, item.Notes, entry.Notes);
            }
        }

        return Encoding.UTF8.GetBytes(text.ToString());
    }

    public async Task<byte[]> GenerateWeeklyReportAsync(string userId, DateOnly weekStart)
    {
        var id = Guid.Parse(userId);
        var weekEnd = weekStart.AddDays(6);

        var entries = await _db.FoodEntries
            .Include(e => e.Items).ThenInclude(i => i.FoodItem)
            .Where(e => e.UserId == id && e.EntryDate >= weekStart && e.EntryDate <= weekEnd)
            .OrderBy(e => e.EntryDate)
            .ToListAsync();

        var checkins = await _db.DailyCheckins
            .Where(c => c.UserId == id && c.CheckinDate >= weekStart && c.CheckinDate <= weekEnd)
            .OrderBy(c => c.CheckinDate)
            .ToListAsync();

        var metrics = await _db.BodyMetrics
            .Where(m => m.UserId == id && m.MeasurementDate >= weekStart && m.MeasurementDate <= weekEnd)
            .OrderBy(m => m.MeasurementDate)
            .ToListAsync();

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(2, Unit.Centimetre);
                page.DefaultTextStyle(x => x.FontSize(10));

                page.Header().Text($"HealthLogger — Viikkoraportti / Weekly Report")
                    .SemiBold().FontSize(16).FontColor(Colors.Blue.Medium);

                page.Content().Column(col =>
                {
                    col.Item().Text($"{weekStart:d.M.yyyy} - {weekEnd:d.M.yyyy}").FontSize(12);
                    col.Item().PaddingVertical(10).LineHorizontal(1);

                    // Daily calorie & macro summary
                    col.Item().Text("Kalorit & makrot / Calories & Macros").SemiBold().FontSize(14);
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(cols =>
                        {
                            cols.RelativeColumn(2);
                            cols.RelativeColumn(1);
                            cols.RelativeColumn(1);
                            cols.RelativeColumn(1);
                            cols.RelativeColumn(1);
                        });

                        table.Header(header =>
                        {
                            header.Cell().Text("Päivä / Day").SemiBold();
                            header.Cell().Text("kcal").SemiBold();
                            header.Cell().Text("Prot (g)").SemiBold();
                            header.Cell().Text("Rasva (g)").SemiBold();
                            header.Cell().Text("Hh (g)").SemiBold();
                        });

                        foreach (var day in Enumerable.Range(0, 7).Select(i => weekStart.AddDays(i)))
                        {
                            var dayItems = entries.Where(e => e.EntryDate == day).SelectMany(e => e.Items).ToList();
                            var totalCal = dayItems.Sum(i => i.CustomCalories ?? (i.FoodItem?.EnergyKcal * i.PortionGrams / 100.0 ?? 0));
                            var totalProt = dayItems.Sum(i => i.FoodItem?.Protein * i.PortionGrams / 100.0 ?? 0);
                            var totalFat = dayItems.Sum(i => i.FoodItem?.Fat * i.PortionGrams / 100.0 ?? 0);
                            var totalCarbs = dayItems.Sum(i => i.FoodItem?.Carbohydrate * i.PortionGrams / 100.0 ?? 0);

                            table.Cell().Text($"{day:ddd d.M}");
                            table.Cell().Text($"{totalCal:F0}");
                            table.Cell().Text($"{totalProt:F1}");
                            table.Cell().Text($"{totalFat:F1}");
                            table.Cell().Text($"{totalCarbs:F1}");
                        }
                    });

                    col.Item().PaddingVertical(10).LineHorizontal(1);

                    // Body metrics section
                    if (metrics.Count > 0)
                    {
                        col.Item().Text("Kehon mittaukset / Body Metrics").SemiBold().FontSize(14);
                        foreach (var m in metrics)
                        {
                            var parts = new List<string>();
                            if (m.WeightKg.HasValue) parts.Add($"Paino/Weight: {m.WeightKg:F1} kg");
                            if (m.WaistCircumferenceCm.HasValue) parts.Add($"Vyötärö/Waist: {m.WaistCircumferenceCm:F1} cm");
                            if (m.SystolicBP.HasValue && m.DiastolicBP.HasValue)
                                parts.Add($"RR: {m.SystolicBP}/{m.DiastolicBP}");
                            col.Item().Text($"  {m.MeasurementDate:d.M}: {string.Join(", ", parts)}");
                        }
                        col.Item().PaddingVertical(10).LineHorizontal(1);
                    }

                    // Wellness summary
                    if (checkins.Count > 0)
                    {
                        col.Item().Text("Hyvinvointi / Wellness").SemiBold().FontSize(14);
                        var moodCheckins = checkins.Where(c => c.MoodRating.HasValue).ToList();
                        var sleepCheckins = checkins.Where(c => c.SleepHours.HasValue).ToList();
                        var energyCheckins = checkins.Where(c => c.EnergyLevel.HasValue).ToList();
                        var stressCheckins = checkins.Where(c => c.StressLevel.HasValue).ToList();

                        if (moodCheckins.Count > 0)
                            col.Item().Text($"  Keskimääräinen mieliala / Avg mood: {moodCheckins.Average(c => c.MoodRating!.Value):F1}/5");
                        if (sleepCheckins.Count > 0)
                            col.Item().Text($"  Keskimääräinen uni / Avg sleep: {sleepCheckins.Average(c => c.SleepHours!.Value):F1}h");
                        if (energyCheckins.Count > 0)
                            col.Item().Text($"  Keskimääräinen energia / Avg energy: {energyCheckins.Average(c => c.EnergyLevel!.Value):F1}/5");
                        if (stressCheckins.Count > 0)
                            col.Item().Text($"  Keskimääräinen stressi / Avg stress: {stressCheckins.Average(c => c.StressLevel!.Value):F1}/5");
                    }
                });

                page.Footer().AlignCenter().Text(x =>
                {
                    x.Span("HealthLogger — ");
                    x.Span("Data source: Fineli®, THL").FontSize(8);
                });
            });
        });

        return document.GeneratePdf();
    }
}
