using System.Globalization;
using System.Text;
using System.Text.Json;
using HealthLogger.Data;
using HealthLogger.Entities;
using HealthLogger.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
    Console.WriteLine($"PASS: {message}");
}

await using var connection = new SqliteConnection("Data Source=:memory:");
await connection.OpenAsync();
var options = new DbContextOptionsBuilder<HealthLoggerDbContext>().UseSqlite(connection).Options;
await using var database = new HealthLoggerDbContext(options);
await database.Database.EnsureCreatedAsync();
var owner = Guid.NewGuid();
var other = Guid.NewGuid();
database.Users.AddRange(
    new UserEntity { Id = owner, ExternalId = "export-owner" },
    new UserEntity { Id = other, ExternalId = "export-other" });
var oldest = new DateOnly(2020, 1, 2);
var newest = new DateOnly(2026, 9, 7);
var early = new DateTime(2026, 9, 7, 8, 15, 30, DateTimeKind.Utc);
var late = early.AddHours(6);
database.DailyCheckins.AddRange(
    new DailyCheckinEntity { Id = Guid.NewGuid(), UserId = owner, CheckinDate = newest, CreatedAt = late, Notes = "new-checkin" },
    new DailyCheckinEntity {
        Id = Guid.NewGuid(), UserId = owner, CheckinDate = oldest, CreatedAt = early,
        SleepQuality = 4, SleepHours = 7.5, MoodRating = 3, EnergyLevel = 2, StressLevel = 1,
        WaterIntakeLiters = 0, ExerciseDone = false, AlcoholUnits = 0, StepCount = 1234,
        ExerciseType = "walk", Notes = "Ääkköset | slash\\\r\nnext\tcell"
    },
    new DailyCheckinEntity { Id = Guid.NewGuid(), UserId = other, CheckinDate = oldest, Notes = "PRIVATE-CHECKIN" });
database.BodyMetrics.AddRange(
    new BodyMetricEntity { Id = Guid.NewGuid(), UserId = owner, MeasurementDate = newest, CreatedAt = late, Notes = "late-metric" },
    new BodyMetricEntity { Id = Guid.NewGuid(), UserId = owner, MeasurementDate = oldest, CreatedAt = late, Notes = "old-metric" },
    new BodyMetricEntity { Id = Guid.NewGuid(), UserId = owner, MeasurementDate = newest, CreatedAt = early,
        WeightKg = 80.5, WaistCircumferenceCm = 90, SystolicBP = 120, DiastolicBP = 80, Notes = "early-metric" },
    new BodyMetricEntity { Id = Guid.NewGuid(), UserId = other, MeasurementDate = oldest, Notes = "PRIVATE-METRIC" });
var food = new FoodItemEntity {
    Id = Guid.NewGuid(), NameEn = "Test food", NameFi = "Testiruoka", EnergyKcal = 200,
    Protein = 4, Fat = 6, Carbohydrate = 8
};
database.FoodEntries.AddRange(
    new FoodEntryEntity { Id = Guid.NewGuid(), UserId = owner, EntryDate = newest,
        ConsumptionTime = new TimeOnly(20, 0), MealType = "dinner", Notes = "late-meal",
        Items = [new FoodEntryItemEntity { Id = Guid.NewGuid(), FoodItem = food, PortionGrams = 50 }] },
    new FoodEntryEntity { Id = Guid.NewGuid(), UserId = owner, EntryDate = oldest,
        ConsumptionTime = new TimeOnly(12, 30), MealType = "lunch", Notes = "old-meal" },
    new FoodEntryEntity { Id = Guid.NewGuid(), UserId = owner, EntryDate = newest,
        ConsumptionTime = new TimeOnly(8, 0), MealType = "breakfast", Notes = "early-meal",
        Items = [new FoodEntryItemEntity { Id = Guid.NewGuid(), PortionGrams = 25, CustomCalories = 0,
            SourceRecipeName = "Recipe", Notes = "custom-item" }] },
    new FoodEntryEntity { Id = Guid.NewGuid(), UserId = owner, EntryDate = newest,
        MealType = "snack", Notes = "unknown-time" },
    new FoodEntryEntity { Id = Guid.NewGuid(), UserId = other, EntryDate = oldest, Notes = "PRIVATE-MEAL" });
await database.SaveChangesAsync();
database.ChangeTracker.Clear();
CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("fi-FI");
var service = new ReportService(database);
var text = Encoding.UTF8.GetString(await service.GenerateTextExportAsync(owner.ToString()));
using var locale = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory,
    "../../../../../HealthLogger/wwwroot/js/locales/en.json")));
foreach (var (key, label) in new[] { ("sleep", "Sleep quality"), ("mood", "Mood"), ("energy", "Energy"), ("stress", "Stress") })
{
    var meanings = Enumerable.Range(1, 5).Select(rating => locale.RootElement.GetProperty($"rating_{key}_{rating}").GetString());
    Check(text.Contains($"| {label} | {string.Join(" | ", meanings)} |"), $"{label} export scale matches all five app rating labels");
}
Check(!text.Contains("PRIVATE-"), "export excludes every other user's records");
Check(text.Contains("| 2020-01-02 | 08:15:30 | 4 | 7.5 | 3 | 2 | 1 | 0 | No | walk | 0 | 1234 |"),
    "all check-in values, zero, false, recorded time and invariant decimals are preserved");
Check(text.Contains("Ääkköset \\| slash\\\\\\r\\nnext\\tcell"), "Unicode and table delimiters are preserved safely");
Check(text.IndexOf("Ääkköset", StringComparison.Ordinal) < text.IndexOf("new-checkin", StringComparison.Ordinal),
    "check-ins include all history in ascending date order");
Check(text.IndexOf("old-metric", StringComparison.Ordinal) < text.IndexOf("early-metric", StringComparison.Ordinal)
    && text.IndexOf("early-metric", StringComparison.Ordinal) < text.IndexOf("late-metric", StringComparison.Ordinal),
    "metrics sort by date then recorded time");
Check(text.Contains("| 2026-09-07 | 08:15:30 | 80.5 | 90 | 120 | 80 | early-metric |"), "metric values include units and recorded time");
Check(text.IndexOf("old-meal", StringComparison.Ordinal) < text.IndexOf("unknown-time", StringComparison.Ordinal)
    && text.IndexOf("unknown-time", StringComparison.Ordinal) < text.IndexOf("early-meal", StringComparison.Ordinal)
    && text.IndexOf("early-meal", StringComparison.Ordinal) < text.IndexOf("late-meal", StringComparison.Ordinal),
    "food sorts by date then consumption time with unknown times first");
Check(text.Contains("Test food | Testiruoka | 50 | 100 | 2 | 3 | 4 |"), "food nutrition is scaled to portion size");
Check(text.Contains("Recipe | - | 25 | 0 | - | - | - | Recipe | custom-item | early-meal"),
    "custom calories and recipe details are preserved without inventing nutrition");
Check(text.Contains("| 2026-09-07 | - | snack |"), "missing consumption time is not invented");
var empty = Encoding.UTF8.GetString(await service.GenerateTextExportAsync(Guid.NewGuid().ToString()));
Check(empty.Contains("| Stress | Extreme | High | Moderate | Low | No stress |"), "empty exports also explain rating scales");
Check(empty.Contains("Check-ins") && empty.Contains("Metrics") && empty.Contains("Food")
    && !empty.Contains("| 202"), "empty exports contain all three table headers without records");
Console.WriteLine(JsonSerializer.Serialize(new { text }));