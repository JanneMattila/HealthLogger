using HealthLogger.Data;
using HealthLogger.Entities;
using Microsoft.EntityFrameworkCore;

namespace HealthLogger.Repositories;

public class EntryRepository
{
    private readonly HealthLoggerDbContext _db;

    public EntryRepository(HealthLoggerDbContext db) => _db = db;

    public async Task<List<FoodEntryEntity>> GetByDateAsync(string userId, DateOnly date)
    {
        var id = Guid.Parse(userId);
        return await _db.FoodEntries
            .Include(e => e.Items).ThenInclude(i => i.FoodItem)
            .Where(e => e.UserId == id && e.EntryDate == date)
            .OrderBy(e => e.ConsumptionTime)
            .ThenBy(e => e.MealType)
            .ToListAsync();
    }

    public async Task<FoodEntryEntity?> GetByIdAsync(string userId, Guid entryId)
    {
        var id = Guid.Parse(userId);
        return await _db.FoodEntries
            .Include(e => e.Items).ThenInclude(i => i.FoodItem)
            .FirstOrDefaultAsync(e => e.Id == entryId && e.UserId == id);
    }

    public async Task<FoodEntryEntity> CreateAsync(FoodEntryEntity entry)
    {
        entry.Id = Guid.NewGuid();
        entry.CreatedAt = DateTime.UtcNow;
        _db.FoodEntries.Add(entry);
        await _db.SaveChangesAsync();
        return entry;
    }

    public async Task<FoodEntryEntity> UpdateAsync(FoodEntryEntity entry)
    {
        entry.UpdatedAt = DateTime.UtcNow;
        _db.FoodEntries.Update(entry);
        await _db.SaveChangesAsync();
        return entry;
    }

    public async Task DeleteAsync(string userId, Guid entryId)
    {
        var id = Guid.Parse(userId);
        var entry = await _db.FoodEntries.AsTracking()
            .FirstOrDefaultAsync(e => e.Id == entryId && e.UserId == id);
        if (entry != null)
        {
            _db.FoodEntries.Remove(entry);
            await _db.SaveChangesAsync();
        }
    }

    public async Task<FoodEntryItemEntity> AddItemAsync(Guid entryId, FoodEntryItemEntity item)
    {
        item.Id = Guid.NewGuid();
        item.FoodEntryId = entryId;
        item.CreatedAt = DateTime.UtcNow;
        _db.FoodEntryItems.Add(item);
        await _db.SaveChangesAsync();

        // Recalculate total calories
        await RecalculateTotalCaloriesAsync(entryId);
        return item;
    }

    public async Task RemoveItemAsync(string userId, Guid entryId, Guid itemId)
    {
        var uid = Guid.Parse(userId);
        var entry = await _db.FoodEntries.FirstOrDefaultAsync(e => e.Id == entryId && e.UserId == uid);
        if (entry == null) return;

        var item = await _db.FoodEntryItems.AsTracking()
            .FirstOrDefaultAsync(i => i.Id == itemId && i.FoodEntryId == entryId);
        if (item != null)
        {
            _db.FoodEntryItems.Remove(item);
            await _db.SaveChangesAsync();
            await RecalculateTotalCaloriesAsync(entryId);
        }
    }

    public async Task<FoodEntryItemEntity?> UpdateItemAsync(
        string userId, Guid entryId, Guid itemId, double portionGrams, string mealType)
    {
        var uid = Guid.Parse(userId);
        var item = await _db.FoodEntryItems.AsTracking()
            .Include(i => i.FoodEntry)
            .Include(i => i.FoodItem)
            .FirstOrDefaultAsync(i => i.Id == itemId && i.FoodEntryId == entryId && i.FoodEntry.UserId == uid);
        if (item is null) return null;

        var sourceEntry = item.FoodEntry;
        var sourceEntryId = sourceEntry.Id;
        item.PortionGrams = portionGrams;

        if (sourceEntry.MealType != mealType)
        {
            var targetEntry = await _db.FoodEntries.AsTracking()
                .FirstOrDefaultAsync(e => e.UserId == uid &&
                    e.EntryDate == sourceEntry.EntryDate && e.MealType == mealType);
            if (targetEntry is null)
            {
                targetEntry = new FoodEntryEntity
                {
                    Id = Guid.NewGuid(),
                    UserId = uid,
                    EntryDate = sourceEntry.EntryDate,
                    MealType = mealType,
                    CreatedAt = DateTime.UtcNow
                };
                _db.FoodEntries.Add(targetEntry);
            }

            item.FoodEntry = targetEntry;
            item.FoodEntryId = targetEntry.Id;
        }

        await _db.SaveChangesAsync();

        if (sourceEntryId != item.FoodEntryId)
        {
            if (await _db.FoodEntryItems.AnyAsync(i => i.FoodEntryId == sourceEntryId))
                await RecalculateTotalCaloriesAsync(sourceEntryId);
            else
            {
                _db.FoodEntries.Remove(sourceEntry);
                await _db.SaveChangesAsync();
            }
        }

        await RecalculateTotalCaloriesAsync(item.FoodEntryId);
        return item;
    }

    private async Task RecalculateTotalCaloriesAsync(Guid entryId)
    {
        var entry = await _db.FoodEntries.AsTracking()
            .Include(e => e.Items).ThenInclude(i => i.FoodItem)
            .FirstOrDefaultAsync(e => e.Id == entryId);

        if (entry != null)
        {
            entry.TotalCalories = entry.Items.Sum(i =>
                i.CustomCalories ?? (i.FoodItem?.EnergyKcal * i.PortionGrams / 100.0 ?? 0));
            entry.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }
    }
}
