using System.Text.Json;

namespace HealthLogger.Services;

public class NutritionSearchService
{
    private readonly IConfiguration _config;
    private readonly ILogger<NutritionSearchService> _logger;

    public NutritionSearchService(IConfiguration config, ILogger<NutritionSearchService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task<object> SearchNutritionOnlineAsync(string query)
    {
        var endpoint = _config["AzureOpenAI:Endpoint"];
        var apiKey = _config["AzureOpenAI:ApiKey"];
        var deploymentName = _config["AzureOpenAI:DeploymentName"] ?? "gpt-4o";

        if (string.IsNullOrEmpty(endpoint) || string.IsNullOrEmpty(apiKey))
        {
            return new { error = "AI not configured. Set AzureOpenAI:Endpoint and AzureOpenAI:ApiKey." };
        }

        var systemPrompt =
            "You are a nutrition database assistant. The user will give you a food product name (possibly a brand name, restaurant item, or generic food). " +
            "Return the nutritional information per 100g AND per full product/serving if applicable.\n\n" +
            "Respond ONLY with a JSON object like this:\n" +
            "{\n" +
            "  \"name\": \"Product name\",\n" +
            "  \"nutritionMode\": \"per100g\" or \"perProduct\",\n" +
            "  \"productWeightG\": total weight in grams (null if per100g only),\n" +
            "  \"per100g\": {\n" +
            "    \"calories\": kcal, \"caloriesKj\": kJ, \"fat\": g, \"saturatedFat\": g,\n" +
            "    \"carbohydrate\": g, \"sugar\": g, \"protein\": g, \"salt\": g\n" +
            "  },\n" +
            "  \"perProduct\": { same fields, or null if unknown }\n" +
            "}\n\n" +
            "Use your best knowledge. If you know the exact product (e.g., a known pizza brand), provide accurate data. " +
            "If not exact, provide a reasonable estimate. Always include per100g values. " +
            "No markdown, no explanation, just JSON.";

        using var httpClient = new HttpClient();
        httpClient.DefaultRequestHeaders.Add("api-key", apiKey);
        httpClient.Timeout = TimeSpan.FromSeconds(30);

        var requestBody = new
        {
            messages = new object[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = $"Find nutrition info for: {query}" }
            },
            max_tokens = 1000,
            temperature = 0.2
        };

        try
        {
            var response = await httpClient.PostAsJsonAsync(
                $"{endpoint}/openai/deployments/{deploymentName}/chat/completions?api-version=2024-08-01-preview",
                requestBody);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("AI nutrition search failed: {Status}", response.StatusCode);
                return new { error = "AI search failed" };
            }

            var responseJson = await response.Content.ReadAsStringAsync();
            var content = ExtractContentFromResponse(responseJson);
            if (content == null) return new { error = "No results" };

            var jsonContent = content.Trim();
            if (jsonContent.StartsWith("```"))
            {
                var firstNl = jsonContent.IndexOf('\n');
                if (firstNl > 0) jsonContent = jsonContent[(firstNl + 1)..];
                if (jsonContent.EndsWith("```")) jsonContent = jsonContent[..^3];
                jsonContent = jsonContent.Trim();
            }

            return JsonSerializer.Deserialize<JsonElement>(jsonContent);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AI nutrition search error");
            return new { error = "Search failed: " + ex.Message };
        }
    }

    private static string? ExtractContentFromResponse(string responseJson)
    {
        using var doc = JsonDocument.Parse(responseJson);
        var root = doc.RootElement;

        if (root.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0)
        {
            var firstChoice = choices[0];
            if (firstChoice.TryGetProperty("message", out var message) &&
                message.TryGetProperty("content", out var content))
            {
                return content.GetString();
            }
        }

        return null;
    }
}