using HealthLogger.Entities;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace HealthLogger.Data;

public static class DatabaseSeeder
{
    public static async Task SeedFoodDataAsync(HealthLoggerDbContext dbContext)
    {
        var foodDataPath = Path.Combine(AppContext.BaseDirectory, "food-data", "fineli", "foods.json");
        if (!File.Exists(foodDataPath))
        {
            // Try relative path for development
            foodDataPath = Path.Combine(Directory.GetCurrentDirectory(), "food-data", "fineli", "foods.json");
        }

        if (!File.Exists(foodDataPath))
        {
            Console.WriteLine("[Seeder] foods.json not found, skipping food data seeding");
            return;
        }

        var json = await File.ReadAllTextAsync(foodDataPath);
        var foods = JsonSerializer.Deserialize<List<FineliFood>>(json, new JsonSerializerOptions 
        { 
            PropertyNameCaseInsensitive = true 
        });

        if (foods == null || foods.Count == 0)
        {
            Console.WriteLine("[Seeder] No food data found in foods.json");
            return;
        }

        // Build lookup of incoming Fineli IDs
        var incomingById = foods.ToDictionary(f => f.FineliId);

        // Load all existing Fineli-sourced items
        var existingItems = await dbContext.FoodItems
            .Where(f => f.FineliId != null && !f.IsUserCreated)
            .ToListAsync();

        var existingByFineliId = existingItems
            .Where(f => f.FineliId.HasValue)
            .ToDictionary(f => f.FineliId!.Value);

        var inserted = 0;
        var updated = 0;
        var removed = 0;

        // Update existing and insert new items
        foreach (var food in foods)
        {
            if (existingByFineliId.TryGetValue(food.FineliId, out var existing))
            {
                // Update if any field has changed
                if (existing.NameFi != (food.NameFi ?? string.Empty) ||
                    existing.NameEn != (food.NameEn ?? string.Empty) ||
                    existing.NameSv != food.NameSv ||
                    existing.Category != food.Category ||
                    existing.EnergyKcal != food.EnergyKcal ||
                    existing.EnergyKj != food.EnergyKj ||
                    existing.Protein != food.Protein ||
                    existing.Fat != food.Fat ||
                    existing.SaturatedFat != food.SaturatedFat ||
                    existing.Carbohydrate != food.Carbohydrate ||
                    existing.Sugar != food.Sugar ||
                    existing.Fiber != food.Fiber ||
                    existing.Salt != food.Salt)
                {
                    existing.NameFi = food.NameFi ?? string.Empty;
                    existing.NameEn = food.NameEn ?? string.Empty;
                    existing.NameSv = food.NameSv;
                    existing.Category = food.Category;
                    existing.EnergyKcal = food.EnergyKcal;
                    existing.EnergyKj = food.EnergyKj;
                    existing.Protein = food.Protein;
                    existing.Fat = food.Fat;
                    existing.SaturatedFat = food.SaturatedFat;
                    existing.Carbohydrate = food.Carbohydrate;
                    existing.Sugar = food.Sugar;
                    existing.Fiber = food.Fiber;
                    existing.Salt = food.Salt;
                    existing.UpdatedAt = DateTime.UtcNow;
                    dbContext.Entry(existing).State = EntityState.Modified;
                    updated++;
                }
            }
            else
            {
                dbContext.FoodItems.Add(new FoodItemEntity
                {
                    Id = Guid.NewGuid(),
                    FineliId = food.FineliId,
                    NameFi = food.NameFi ?? string.Empty,
                    NameEn = food.NameEn ?? string.Empty,
                    NameSv = food.NameSv,
                    Category = food.Category,
                    EnergyKcal = food.EnergyKcal,
                    EnergyKj = food.EnergyKj,
                    Protein = food.Protein,
                    Fat = food.Fat,
                    SaturatedFat = food.SaturatedFat,
                    Carbohydrate = food.Carbohydrate,
                    Sugar = food.Sugar,
                    Fiber = food.Fiber,
                    Salt = food.Salt,
                    IsUserCreated = false,
                    UserId = null,
                    CreatedAt = DateTime.UtcNow
                });
                inserted++;
            }
        }

        // Remove Fineli items no longer in the data file (e.g. archived items)
        // but only if they aren't referenced in any food entries
        foreach (var existing in existingItems)
        {
            if (existing.FineliId.HasValue && !incomingById.ContainsKey(existing.FineliId.Value))
            {
                var isReferenced = await dbContext.Set<FoodEntryItemEntity>()
                    .AnyAsync(ei => ei.FoodItemId == existing.Id);
                if (!isReferenced)
                {
                    dbContext.FoodItems.Remove(existing);
                    removed++;
                }
            }
        }

        if (inserted > 0 || updated > 0 || removed > 0)
        {
            var savedCount = await dbContext.SaveChangesAsync();
            Console.WriteLine($"[Seeder] Fineli sync: {inserted} added, {updated} updated, {removed} removed ({savedCount} DB rows affected)");
        }
        else
        {
            var totalCount = await dbContext.FoodItems.CountAsync();
            Console.WriteLine($"[Seeder] Food data up to date ({totalCount} items in database)");
        }
    }

    private class FineliFood
    {
        public int FineliId { get; set; }
        public string? NameFi { get; set; }
        public string? NameEn { get; set; }
        public string? NameSv { get; set; }
        public string? Category { get; set; }
        public double EnergyKcal { get; set; }
        public double EnergyKj { get; set; }
        public double Protein { get; set; }
        public double Fat { get; set; }
        public double? SaturatedFat { get; set; }
        public double Carbohydrate { get; set; }
        public double? Sugar { get; set; }
        public double? Fiber { get; set; }
        public double? Salt { get; set; }
    }
}
