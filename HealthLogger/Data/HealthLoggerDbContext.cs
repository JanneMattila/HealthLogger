using HealthLogger.Entities;
using Microsoft.EntityFrameworkCore;

namespace HealthLogger.Data;

public class HealthLoggerDbContext : DbContext
{
    public HealthLoggerDbContext(DbContextOptions<HealthLoggerDbContext> options) : base(options) { }

    public DbSet<UserEntity> Users => Set<UserEntity>();
    public DbSet<FoodItemEntity> FoodItems => Set<FoodItemEntity>();
    public DbSet<FoodEntryEntity> FoodEntries => Set<FoodEntryEntity>();
    public DbSet<FoodEntryItemEntity> FoodEntryItems => Set<FoodEntryItemEntity>();
    public DbSet<CustomRecipeEntity> CustomRecipes => Set<CustomRecipeEntity>();
    public DbSet<RecipeIngredientEntity> RecipeIngredients => Set<RecipeIngredientEntity>();
    public DbSet<DailyCheckinEntity> DailyCheckins => Set<DailyCheckinEntity>();
    public DbSet<BodyMetricEntity> BodyMetrics => Set<BodyMetricEntity>();
    public DbSet<UserPreferencesEntity> UserPreferences => Set<UserPreferencesEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // User
        modelBuilder.Entity<UserEntity>(entity =>
        {
            entity.ToTable("Users");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.ExternalId).IsUnique();
            entity.Property(e => e.ExternalId).IsRequired();
            entity.Property(e => e.AuthType).IsRequired();
            entity.Property(e => e.Name).IsRequired();
        });

        // FoodItem
        modelBuilder.Entity<FoodItemEntity>(entity =>
        {
            entity.ToTable("FoodItems");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.FineliId);
            entity.HasIndex(e => e.NameFi);
            entity.HasIndex(e => e.NameEn);
            entity.HasIndex(e => e.Category);
            entity.HasIndex(e => new { e.UserId, e.Barcode })
                .IsUnique()
                .HasFilter("[UserId] IS NOT NULL AND [Barcode] IS NOT NULL");
            entity.Property(e => e.NameFi).IsRequired();
            entity.Property(e => e.NameEn).IsRequired();
            entity.HasOne(e => e.User)
                  .WithMany()
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // FoodEntry
        modelBuilder.Entity<FoodEntryEntity>(entity =>
        {
            entity.ToTable("FoodEntries");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => new { e.UserId, e.EntryDate });
            entity.Property(e => e.ConsumptionTime).HasColumnType("time");
            entity.Property(e => e.MealType).IsRequired();
            entity.HasOne(e => e.User)
                  .WithMany(u => u.FoodEntries)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // FoodEntryItem
        modelBuilder.Entity<FoodEntryItemEntity>(entity =>
        {
            entity.ToTable("FoodEntryItems");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.FoodEntryId);
            entity.HasIndex(e => e.FoodItemId);
            entity.HasOne(e => e.FoodEntry)
                  .WithMany(fe => fe.Items)
                  .HasForeignKey(e => e.FoodEntryId)
                  .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.FoodItem)
                  .WithMany(fi => fi.EntryItems)
                  .HasForeignKey(e => e.FoodItemId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // CustomRecipe
        modelBuilder.Entity<CustomRecipeEntity>(entity =>
        {
            entity.ToTable("CustomRecipes");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.UserId);
            entity.Property(e => e.Name).IsRequired();
            entity.HasOne(e => e.User)
                  .WithMany(u => u.CustomRecipes)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // RecipeIngredient
        modelBuilder.Entity<RecipeIngredientEntity>(entity =>
        {
            entity.ToTable("RecipeIngredients");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.RecipeId);
            entity.HasIndex(e => e.FoodItemId);
            entity.HasOne(e => e.Recipe)
                  .WithMany(r => r.Ingredients)
                  .HasForeignKey(e => e.RecipeId)
                  .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.FoodItem)
                  .WithMany(fi => fi.RecipeIngredients)
                  .HasForeignKey(e => e.FoodItemId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // DailyCheckin
        modelBuilder.Entity<DailyCheckinEntity>(entity =>
        {
            entity.ToTable("DailyCheckins");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.UserId, e.CheckinDate }).IsUnique();
            entity.HasOne(e => e.User)
                  .WithMany(u => u.DailyCheckins)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // BodyMetric
        modelBuilder.Entity<BodyMetricEntity>(entity =>
        {
            entity.ToTable("BodyMetrics");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.UserId, e.MeasurementDate });
            entity.HasOne(e => e.User)
                  .WithMany(u => u.BodyMetrics)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // UserPreferences
        modelBuilder.Entity<UserPreferencesEntity>(entity =>
        {
            entity.ToTable("UserPreferences");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.UserId).IsUnique();
            entity.HasOne(e => e.User)
                  .WithOne(u => u.Preferences)
                  .HasForeignKey<UserPreferencesEntity>(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
