using HealthLogger.Data;
using HealthLogger.Entities;
using HealthLogger.Models;
using HealthLogger.Services;
using Microsoft.EntityFrameworkCore;

namespace HealthLogger.Repositories;

public class FoodRepository
{
    private readonly HealthLoggerDbContext _db;

    public FoodRepository(HealthLoggerDbContext db) => _db = db;

    public async Task<List<FoodSearchResult>> SearchAsync(Guid userId, string query, string lang = "fi", int limit = 20, int offset = 0)
    {
        var q = _db.FoodItems.Where(f => f.UserId == null || f.UserId == userId);

        // Search both Finnish and English names simultaneously (case-insensitive via EF.Functions.Like)
        q = q.Where(f => EF.Functions.Like(f.NameFi, $"%{query}%") || 
                         EF.Functions.Like(f.NameEn, $"%{query}%"));

        return await q
            .OrderBy(f => lang == "fi" ? f.NameFi : f.NameEn)
            .Skip(offset)
            .Take(limit)
            .Select(f => new FoodSearchResult
            {
                Id = f.Id,
                FineliId = f.FineliId,
                NameFi = f.NameFi,
                NameEn = f.NameEn,
                Category = f.Category,
                DefaultPortionGrams = f.DefaultPortionGrams,
                UnitWeightGrams = f.UnitWeightGrams,
                EnergyKcal = f.EnergyKcal,
                Protein = f.Protein,
                Fat = f.Fat,
                Carbohydrate = f.Carbohydrate
            }).ToListAsync();
    }

    public async Task<FoodItemEntity?> GetByIdAsync(Guid id)
    {
        return await _db.FoodItems.FirstOrDefaultAsync(f => f.Id == id);
    }

    public async Task<FoodItemEntity?> GetAccessibleByIdAsync(Guid userId, Guid id)
    {
        return await _db.FoodItems.FirstOrDefaultAsync(f =>
            f.Id == id && (f.UserId == null || f.UserId == userId));
    }

    public async Task<FoodItemEntity?> UpdateWeightsAsync(Guid userId, Guid id, double defaultPortionGrams, double? unitWeightGrams)
    {
        var food = await _db.FoodItems.AsTracking().FirstOrDefaultAsync(f =>
            f.Id == id && (f.UserId == null || f.UserId == userId));
        if (food is null)
            return null;

        food.DefaultPortionGrams = defaultPortionGrams;
        food.UnitWeightGrams = unitWeightGrams;
        food.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return food;
    }

    public async Task<FoodItemEntity?> UpdateCustomFoodAsync(Guid userId, Guid foodId, FoodItemEntity update)
    {
        var food = await _db.FoodItems.AsTracking().FirstOrDefaultAsync(existing =>
            existing.Id == foodId && existing.IsUserCreated && existing.UserId == userId);
        if (food is null)
            return null;

        food.NameFi = update.NameFi;
        food.NameEn = update.NameEn;
        food.Category = update.Category;
        food.DefaultPortionGrams = update.DefaultPortionGrams;
        food.UnitWeightGrams = update.UnitWeightGrams;
        food.EnergyKcal = update.EnergyKcal;
        food.EnergyKj = update.EnergyKj > 0
            ? update.EnergyKj
            : NutritionCalculator.CalculateKilojoules(update.EnergyKcal);
        food.Protein = update.Protein;
        food.Fat = update.Fat;
        food.SaturatedFat = update.SaturatedFat;
        food.Carbohydrate = update.Carbohydrate;
        food.Sugar = update.Sugar;
        food.Fiber = update.Fiber;
        food.Salt = update.Salt;
        food.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return food;
    }

    public async Task<FoodItemEntity?> GetByBarcodeAsync(Guid userId, string barcode)
    {
        return await _db.FoodItems.FirstOrDefaultAsync(f => f.UserId == userId && f.Barcode == barcode);
    }

    public async Task<FoodItemEntity?> FindLegacyBarcodeCandidateAsync(Guid userId, string? nameFi, string? nameEn)
    {
        if (string.IsNullOrWhiteSpace(nameFi) && string.IsNullOrWhiteSpace(nameEn))
            return null;

        return await _db.FoodItems
            .Where(f => f.UserId == userId && f.IsUserCreated && f.Barcode == null)
            .Where(f => (!string.IsNullOrEmpty(nameFi) && f.NameFi == nameFi) ||
                        (!string.IsNullOrEmpty(nameEn) && f.NameEn == nameEn))
            .OrderBy(f => f.CreatedAt)
            .FirstOrDefaultAsync();
    }

    public async Task SaveBarcodeDetailsAsync(FoodItemEntity food)
    {
        food.UpdatedAt = DateTime.UtcNow;
        _db.FoodItems.Update(food);
        await _db.SaveChangesAsync();
    }

    public async Task<List<FoodItemEntity>> BrowseAsync(Guid userId, string? category, string lang = "en", int limit = 50, int offset = 0)
    {
        var q = _db.FoodItems.Where(f => f.UserId == null || f.UserId == userId);
        if (!string.IsNullOrWhiteSpace(category))
            q = q.Where(f => f.Category == category);
        return await q
            .OrderBy(f => lang == "fi" ? f.NameFi : f.NameEn)
            .Skip(offset)
            .Take(limit)
            .ToListAsync();
    }

    public async Task<List<string>> GetCategoriesAsync(Guid userId)
    {
        return await _db.FoodItems
            .Where(f => f.Category != null && (f.UserId == null || f.UserId == userId))
            .Select(f => f.Category!)
            .Distinct()
            .OrderBy(c => c)
            .ToListAsync();
    }

    public async Task<FoodItemEntity?> GetByFineliIdAsync(int fineliId)
    {
        return await _db.FoodItems.FirstOrDefaultAsync(f =>
            f.FineliId == fineliId && !f.IsUserCreated && f.UserId == null);
    }

    public async Task<FoodItemEntity> CreateCustomFoodAsync(FoodItemEntity food)
    {
        if (food.DefaultPortionGrams <= 0)
            food.DefaultPortionGrams = 100;
        if (food.EnergyKj <= 0)
            food.EnergyKj = NutritionCalculator.CalculateKilojoules(food.EnergyKcal);

        if (food.UserId.HasValue && !string.IsNullOrWhiteSpace(food.Barcode))
        {
            var existing = await GetByBarcodeAsync(food.UserId.Value, food.Barcode);
            if (existing is not null)
                return existing;
        }

        food.Id = Guid.NewGuid();
        food.FineliId = null;
        food.IsUserCreated = true;
        food.CreatedAt = DateTime.UtcNow;
        _db.FoodItems.Add(food);
        try
        {
            await _db.SaveChangesAsync();
            return food;
        }
        catch (DbUpdateException) when (food.UserId.HasValue && !string.IsNullOrWhiteSpace(food.Barcode))
        {
            _db.Entry(food).State = EntityState.Detached;
            var existing = await GetByBarcodeAsync(food.UserId.Value, food.Barcode);
            if (existing is not null)
                return existing;
            throw;
        }
    }

    public async Task<List<FoodItemEntity>> FuzzyMatchAsync(string name, int limit = 5)
    {
        // Simple fuzzy: search both Finnish and English names
        return await _db.FoodItems
            .Where(f => EF.Functions.Like(f.NameFi, $"%{name}%") || 
                        EF.Functions.Like(f.NameEn, $"%{name}%"))
            .Take(limit)
            .ToListAsync();
    }
}
