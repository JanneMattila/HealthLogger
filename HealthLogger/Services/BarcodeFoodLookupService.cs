using System.Globalization;
using System.Text.Json;
using HealthLogger.Entities;

namespace HealthLogger.Services;

public sealed class BarcodeFoodLookupService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<BarcodeFoodLookupService> _logger;

    public BarcodeFoodLookupService(
        IHttpClientFactory httpClientFactory,
        ILogger<BarcodeFoodLookupService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<BarcodeFoodLookupResult> LookupAsync(string barcode, CancellationToken cancellationToken)
    {
        if (!IsValidGtin(barcode))
            return new(false, barcode, Error: "invalid_barcode");

        var client = _httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.UserAgent.ParseAdd("HealthLogger/1.0 (food barcode lookup)");
        client.Timeout = TimeSpan.FromSeconds(15);

        var fields = "code,product_name,product_name_fi,product_name_en,brands,categories_tags,nutriments,quantity";
        var url = $"https://world.openfoodfacts.org/api/v2/product/{barcode}.json?fields={fields}";

        try
        {
            using var response = await client.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();
            using var document = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(cancellationToken));
            var root = document.RootElement;

            if (!root.TryGetProperty("status", out var status) || status.GetInt32() != 1 ||
                !root.TryGetProperty("product", out var product))
            {
                return new(false, barcode);
            }

            var nameFi = Text(product, "product_name_fi");
            var nameEn = Text(product, "product_name_en");
            var generalName = Text(product, "product_name");
            var brand = Text(product, "brands");
            var displayName = string.Join(" ", new[] { brand, generalName }.Where(value => !string.IsNullOrWhiteSpace(value))).Trim();
            nameFi ??= generalName ?? nameEn ?? displayName;
            nameEn ??= generalName ?? nameFi ?? displayName;

            if (string.IsNullOrWhiteSpace(nameFi) && string.IsNullOrWhiteSpace(nameEn))
                return new(false, barcode);

            product.TryGetProperty("nutriments", out var nutriments);
            var category = product.TryGetProperty("categories_tags", out var categories) && categories.ValueKind == JsonValueKind.Array
                ? categories.EnumerateArray().Select(item => item.GetString()).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Replace("en:", "")
                : null;
            var energyKcal = Number(nutriments, "energy-kcal_100g");
            var energyKj = Number(nutriments, "energy-kj_100g");
            if (energyKj <= 0)
                energyKj = NutritionCalculator.CalculateKilojoules(energyKcal);

            return new BarcodeFoodLookupResult(
                true,
                barcode,
                nameFi,
                nameEn,
                category,
                energyKcal,
                energyKj,
                Number(nutriments, "proteins_100g"),
                Number(nutriments, "fat_100g"),
                Number(nutriments, "saturated-fat_100g"),
                Number(nutriments, "carbohydrates_100g"),
                Number(nutriments, "sugars_100g"),
                Number(nutriments, "fiber_100g"),
                Number(nutriments, "salt_100g"),
                Text(product, "quantity"),
                "Open Food Facts");
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            _logger.LogWarning(ex, "Barcode lookup failed for {Barcode}", barcode);
            return new(false, barcode, Error: "lookup_failed");
        }
    }

    public static bool IsValidGtin(string value)
    {
        if (value.Length is < 8 or > 14 || value.Any(character => !char.IsAsciiDigit(character)))
            return false;

        var sum = 0;
        for (var index = value.Length - 2; index >= 0; index--)
        {
            var digit = value[index] - '0';
            sum += digit * ((value.Length - index) % 2 == 0 ? 3 : 1);
        }

        return (10 - sum % 10) % 10 == value[^1] - '0';
    }

    private static string? Text(JsonElement element, string propertyName) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(propertyName, out var value)
            ? value.GetString()
            : null;

    private static double Number(JsonElement element, string propertyName)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var value))
            return 0;

        if (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number))
            return number;

        return value.ValueKind == JsonValueKind.String &&
            double.TryParse(value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out number)
            ? number
            : 0;
    }

}

public sealed record BarcodeFoodLookupResult(
    bool Found,
    string Barcode,
    string? NameFi = null,
    string? NameEn = null,
    string? Category = null,
    double EnergyKcal = 0,
    double EnergyKj = 0,
    double Protein = 0,
    double Fat = 0,
    double? SaturatedFat = null,
    double Carbohydrate = 0,
    double? Sugar = null,
    double? Fiber = null,
    double? Salt = null,
    string? Quantity = null,
    string? Source = null,
    string? Error = null,
    Guid? ExistingFoodId = null,
    double DefaultPortionGrams = 100)
{
    public static BarcodeFoodLookupResult FromExisting(FoodItemEntity food, string barcode) => new(
        true,
        barcode,
        food.NameFi,
        food.NameEn,
        food.Category,
        food.EnergyKcal,
        food.EnergyKj,
        food.Protein,
        food.Fat,
        food.SaturatedFat,
        food.Carbohydrate,
        food.Sugar,
        food.Fiber,
        food.Salt,
        Source: food.BarcodeSource ?? "Health Logger",
        ExistingFoodId: food.Id,
        DefaultPortionGrams: food.DefaultPortionGrams);
}