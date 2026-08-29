using HealthLogger.Data;
using HealthLogger.Models;
using Microsoft.EntityFrameworkCore;

namespace HealthLogger.Services;

public class StatsService
{
    private readonly HealthLoggerDbContext _db;

    public StatsService(HealthLoggerDbContext db) => _db = db;

    public async Task<List<NutrientBreakdown>> GetCalorieTrendAsync(string userId, DateOnly from, DateOnly to)
    {
        var id = Guid.Parse(userId);
        var entries = await _db.FoodEntries
            .Include(e => e.Items).ThenInclude(i => i.FoodItem)
            .Where(e => e.UserId == id && e.EntryDate >= from && e.EntryDate <= to)
            .ToListAsync();

        return entries
            .GroupBy(e => e.EntryDate)
            .Select(g => new NutrientBreakdown
            {
                Date = g.Key,
                TotalCalories = g.SelectMany(e => e.Items).Sum(i =>
                    i.CustomCalories ?? (i.FoodItem?.EnergyKcal * i.PortionGrams / 100.0 ?? 0)),
                Protein = g.SelectMany(e => e.Items).Sum(i =>
                    i.FoodItem?.Protein * i.PortionGrams / 100.0 ?? 0),
                Fat = g.SelectMany(e => e.Items).Sum(i =>
                    i.FoodItem?.Fat * i.PortionGrams / 100.0 ?? 0),
                Carbohydrate = g.SelectMany(e => e.Items).Sum(i =>
                    i.FoodItem?.Carbohydrate * i.PortionGrams / 100.0 ?? 0),
                Fiber = g.SelectMany(e => e.Items).Sum(i =>
                    (i.FoodItem?.Fiber ?? 0) * i.PortionGrams / 100.0),
                Sugar = g.SelectMany(e => e.Items).Sum(i =>
                    (i.FoodItem?.Sugar ?? 0) * i.PortionGrams / 100.0)
            })
            .OrderBy(n => n.Date)
            .ToList();
    }

    public async Task<List<WellnessTrend>> GetWellnessTrendAsync(string userId, DateOnly from, DateOnly to)
    {
        var id = Guid.Parse(userId);
        return await _db.DailyCheckins
            .Where(c => c.UserId == id && c.CheckinDate >= from && c.CheckinDate <= to)
            .OrderBy(c => c.CheckinDate)
            .Select(c => new WellnessTrend
            {
                Date = c.CheckinDate,
                SleepQuality = c.SleepQuality,
                SleepHours = c.SleepHours,
                MoodRating = c.MoodRating,
                EnergyLevel = c.EnergyLevel,
                StressLevel = c.StressLevel,
                WaterIntakeLiters = c.WaterIntakeLiters,
                ExerciseDone = c.ExerciseDone,
                AlcoholUnits = c.AlcoholUnits,
                StepCount = c.StepCount
            })
            .ToListAsync();
    }

    public async Task<object> GetMacroDistributionAsync(string userId, DateOnly from, DateOnly to)
    {
        var id = Guid.Parse(userId);
        var entries = await _db.FoodEntries
            .Include(e => e.Items).ThenInclude(i => i.FoodItem)
            .Where(e => e.UserId == id && e.EntryDate >= from && e.EntryDate <= to)
            .ToListAsync();

        var allItems = entries.SelectMany(e => e.Items).ToList();
        var totalProteinG = allItems.Sum(i => i.FoodItem?.Protein * i.PortionGrams / 100.0 ?? 0);
        var totalFatG = allItems.Sum(i => i.FoodItem?.Fat * i.PortionGrams / 100.0 ?? 0);
        var totalCarbsG = allItems.Sum(i => i.FoodItem?.Carbohydrate * i.PortionGrams / 100.0 ?? 0);

        // Calories from each macro: protein 4 kcal/g, fat 9 kcal/g, carbs 4 kcal/g
        var proteinCal = totalProteinG * 4;
        var fatCal = totalFatG * 9;
        var carbsCal = totalCarbsG * 4;
        var totalMacroCal = proteinCal + fatCal + carbsCal;

        var dayCount = entries.Select(e => e.EntryDate).Distinct().Count();
        if (dayCount == 0) dayCount = 1;

        var totalCalories = allItems.Sum(i =>
            i.CustomCalories ?? (i.FoodItem?.EnergyKcal * i.PortionGrams / 100.0 ?? 0));

        return new
        {
            ProteinPercent = totalMacroCal > 0 ? Math.Round(proteinCal / totalMacroCal * 100, 1) : 0,
            FatPercent = totalMacroCal > 0 ? Math.Round(fatCal / totalMacroCal * 100, 1) : 0,
            CarbsPercent = totalMacroCal > 0 ? Math.Round(carbsCal / totalMacroCal * 100, 1) : 0,
            AvgDailyCalories = Math.Round(totalCalories / dayCount, 0),
            AvgDailyProtein = Math.Round(totalProteinG / dayCount, 1),
            AvgDailyFat = Math.Round(totalFatG / dayCount, 1),
            AvgDailyCarbs = Math.Round(totalCarbsG / dayCount, 1),
            DaysWithData = dayCount
        };
    }

    public async Task<DashboardData> GetDashboardAsync(string userId)
    {
        var id = Guid.Parse(userId);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var weekAgo = today.AddDays(-7);

        var todayEntries = await _db.FoodEntries
            .Include(e => e.Items).ThenInclude(i => i.FoodItem)
            .Where(e => e.UserId == id && e.EntryDate == today)
            .ToListAsync();

        var weekEntries = await _db.FoodEntries
            .Where(e => e.UserId == id && e.EntryDate >= weekAgo && e.EntryDate <= today)
            .ToListAsync();

        var prefs = await _db.UserPreferences.FirstOrDefaultAsync(p => p.UserId == id);
        var checkin = await _db.DailyCheckins.FirstOrDefaultAsync(c => c.UserId == id && c.CheckinDate == today);
        var latestMetric = await _db.BodyMetrics
            .Where(m => m.UserId == id)
            .OrderByDescending(m => m.MeasurementDate)
            .FirstOrDefaultAsync();

        var allItems = todayEntries.SelectMany(e => e.Items).ToList();

        return new DashboardData
        {
            Date = today,
            CaloriesToday = allItems.Sum(i => i.CustomCalories ?? (i.FoodItem?.EnergyKcal * i.PortionGrams / 100.0 ?? 0)),
            CalorieTarget = prefs?.DailyCalorieTarget,
            ProteinToday = allItems.Sum(i => i.FoodItem?.Protein * i.PortionGrams / 100.0 ?? 0),
            FatToday = allItems.Sum(i => i.FoodItem?.Fat * i.PortionGrams / 100.0 ?? 0),
            CarbsToday = allItems.Sum(i => i.FoodItem?.Carbohydrate * i.PortionGrams / 100.0 ?? 0),
            MealsLogged = todayEntries.Count,
            TodayCheckin = checkin == null ? null : new DailyCheckinSummary
            {
                SleepQuality = checkin.SleepQuality,
                SleepHours = checkin.SleepHours,
                MoodRating = checkin.MoodRating,
                EnergyLevel = checkin.EnergyLevel,
                StressLevel = checkin.StressLevel
            },
            LatestMetrics = latestMetric == null ? null : new BodyMetricSummary
            {
                Date = latestMetric.MeasurementDate,
                WeightKg = latestMetric.WeightKg,
                WaistCircumferenceCm = latestMetric.WaistCircumferenceCm
            },
            WeeklyCalorieTrend = weekEntries
                .GroupBy(e => e.EntryDate)
                .Select(g => new CalorieTrendPoint
                {
                    Date = g.Key,
                    Calories = g.Sum(e => e.TotalCalories)
                })
                .OrderBy(t => t.Date)
                .ToList()
        };
    }
}
