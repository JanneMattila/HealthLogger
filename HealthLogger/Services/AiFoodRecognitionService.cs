using System.Text.Json;
using HealthLogger.Models;
using HealthLogger.Repositories;

namespace HealthLogger.Services;

public class AiFoodRecognitionService
{
    private readonly IConfiguration _config;
    private readonly FoodRepository _foodRepo;
    private readonly ILogger<AiFoodRecognitionService> _logger;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public AiFoodRecognitionService(IConfiguration config, FoodRepository foodRepo, ILogger<AiFoodRecognitionService> logger)
    {
        _config = config;
        _foodRepo = foodRepo;
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

    public async Task<PhotoAnalysisResult> AnalyzeImageAsync(Guid photoId, byte[] imageData, string contentType)
    {
        var endpoint = _config["AzureOpenAI:Endpoint"];
        var apiKey = _config["AzureOpenAI:ApiKey"];
        var deploymentName = _config["AzureOpenAI:DeploymentName"] ?? "gpt-4o";

        if (string.IsNullOrEmpty(endpoint) || string.IsNullOrEmpty(apiKey))
        {
            _logger.LogWarning("Azure OpenAI not configured — returning guidance message");
            return new PhotoAnalysisResult
            {
                PhotoId = photoId,
                ErrorMessage = "AI-ruoantunnistus ei ole käytössä. Määritä AzureOpenAI:Endpoint ja AzureOpenAI:ApiKey asetuksissa. / " +
                               "AI food recognition is not configured. Set AzureOpenAI:Endpoint and AzureOpenAI:ApiKey in appsettings."
            };
        }

        var base64Image = Convert.ToBase64String(imageData);
        var mediaType = contentType.StartsWith("image/") ? contentType : "image/jpeg";

        using var httpClient = new HttpClient();
        httpClient.DefaultRequestHeaders.Add("api-key", apiKey);
        httpClient.Timeout = TimeSpan.FromSeconds(60);

        var systemPrompt =
            "You are an expert food analysis assistant specializing in Finnish cuisine and products available in Finland. " +
            "Analyze the food photo and identify every distinct food item visible. " +
            "For each item provide:\n" +
            "- name_fi: Finnish name (use common Fineli database naming, e.g. 'ruisleipä', 'lohikeitto', 'karjalanpiirakka')\n" +
            "- name_en: English name\n" +
            "- estimated_portion_grams: realistic portion weight in grams. Use these guidelines:\n" +
            "  · Slice of bread: 30-40g, with butter/spread add 5-10g\n" +
            "  · Portion of soup/stew: 300-400g\n" +
            "  · Portion of salad: 150-200g\n" +
            "  · Glass of milk/juice: 200ml (~200g)\n" +
            "  · Portion of meat/fish: 100-150g\n" +
            "  · Portion of rice/pasta/potatoes: 150-200g cooked\n" +
            "  · Finnish meatball (lihapulla): 30-40g each\n" +
            "  · Karelian pie (karjalanpiirakka): 60-80g each\n" +
            "- estimated_calories_kcal: total estimated calories for the portion\n\n" +
            "Respond ONLY with a JSON array. No markdown, no explanation. Example:\n" +
            "[{\"name_fi\":\"ruisleipä\",\"name_en\":\"rye bread\",\"estimated_portion_grams\":35,\"estimated_calories_kcal\":75}]";

        var requestBody = new
        {
            messages = new object[]
            {
                new { role = "system", content = systemPrompt },
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new { type = "text", text = "Identify all food items in this image. Estimate realistic portion sizes." },
                        new { type = "image_url", image_url = new { url = $"data:{mediaType};base64,{base64Image}" } }
                    }
                }
            },
            max_tokens = 2000,
            temperature = 0.2
        };

        var result = new PhotoAnalysisResult { PhotoId = photoId };

        try
        {
            var response = await httpClient.PostAsJsonAsync(
                $"{endpoint}/openai/deployments/{deploymentName}/chat/completions?api-version=2024-08-01-preview",
                requestBody);

            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync();
                _logger.LogError("Azure OpenAI API call failed: {StatusCode} — {Body}", response.StatusCode, errorBody);
                result.ErrorMessage = $"AI-analyysi epäonnistui (HTTP {(int)response.StatusCode}). / AI analysis failed.";
                return result;
            }

            var responseJson = await response.Content.ReadAsStringAsync();
            result.RawAnalysis = responseJson;

            var content = ExtractContentFromResponse(responseJson);
            if (content == null)
            {
                result.ErrorMessage = "AI ei palauttanut tuloksia. / AI returned no results.";
                return result;
            }

            var jsonContent = ExtractJsonArray(content);
            var items = JsonSerializer.Deserialize<List<AiIdentifiedItem>>(jsonContent, JsonOptions);

            if (items != null)
            {
                foreach (var item in items)
                {
                    var identified = new IdentifiedFoodItem
                    {
                        NameFi = item.NameFi ?? item.Name ?? "",
                        NameEn = item.NameEn ?? item.Name ?? "",
                        EstimatedPortionGrams = item.EstimatedPortionGrams > 0 ? item.EstimatedPortionGrams : 100,
                        EstimatedCalories = item.EstimatedCaloriesKcal > 0 ? item.EstimatedCaloriesKcal : item.EstimatedCalories
                    };

                    // Try to match against Fineli database
                    await MatchFineliFood(identified);
                    result.IdentifiedItems.Add(identified);
                }
            }
        }
        catch (TaskCanceledException)
        {
            _logger.LogError("Azure OpenAI request timed out");
            result.ErrorMessage = "AI-analyysi aikakatkaistiin. Yritä uudelleen. / AI analysis timed out. Please try again.";
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Network error calling Azure OpenAI");
            result.ErrorMessage = "Verkkovirhe AI-palveluun. / Network error connecting to AI service.";
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to parse AI response");
            result.ErrorMessage = "AI-vastauksen käsittely epäonnistui. / Failed to process AI response.";
        }

        return result;
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

        // Handle alternative response formats (e.g. error responses with inline content)
        if (root.TryGetProperty("error", out var error))
        {
            return null;
        }

        return null;
    }

    private static string ExtractJsonArray(string content)
    {
        var trimmed = content.Trim();

        // Strip markdown code fences: ```json ... ``` or ``` ... ```
        if (trimmed.StartsWith("```"))
        {
            var firstNewline = trimmed.IndexOf('\n');
            if (firstNewline > 0)
                trimmed = trimmed[(firstNewline + 1)..];
            if (trimmed.EndsWith("```"))
                trimmed = trimmed[..^3];
            trimmed = trimmed.Trim();
        }

        // If the response is a JSON object wrapping an array (e.g. {"items": [...]})
        if (trimmed.StartsWith("{"))
        {
            using var doc = JsonDocument.Parse(trimmed);
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                if (prop.Value.ValueKind == JsonValueKind.Array)
                    return prop.Value.GetRawText();
            }
        }

        // If it's already an array, use as-is
        if (trimmed.StartsWith("["))
            return trimmed;

        // Last resort: find array brackets in the string
        var start = trimmed.IndexOf('[');
        var end = trimmed.LastIndexOf(']');
        if (start >= 0 && end > start)
            return trimmed[start..(end + 1)];

        return "[]";
    }

    private async Task MatchFineliFood(IdentifiedFoodItem identified)
    {
        var searchName = !string.IsNullOrEmpty(identified.NameFi) ? identified.NameFi : identified.NameEn;
        if (string.IsNullOrWhiteSpace(searchName)) return;

        var matches = await _foodRepo.FuzzyMatchAsync(searchName, 3);

        if (matches.Count > 0)
        {
            var best = matches[0];
            identified.MatchedFoodItemId = best.Id;
            identified.MatchedFoodName = best.NameFi;
            identified.FineliEnergyKcalPer100g = best.EnergyKcal;
            identified.FineliProteinPer100g = best.Protein;
            identified.FineliCarbsPer100g = best.Carbohydrate;
            identified.FineliFatPer100g = best.Fat;

            // Confidence scoring: exact match → high, partial match → medium, fallback → low
            var nameLower = searchName.ToLowerInvariant();
            var matchLower = (best.NameFi ?? "").ToLowerInvariant();
            if (matchLower == nameLower || (best.NameEn ?? "").Equals(searchName, StringComparison.OrdinalIgnoreCase))
                identified.MatchConfidence = 0.95;
            else if (matchLower.Contains(nameLower) || nameLower.Contains(matchLower))
                identified.MatchConfidence = 0.75;
            else
                identified.MatchConfidence = 0.5;
        }
        else
        {
            identified.MatchConfidence = 0.0;
        }
    }

    private class AiIdentifiedItem
    {
        public string? Name { get; set; }
        public string? NameFi { get; set; }
        public string? NameEn { get; set; }
        public double EstimatedPortionGrams { get; set; }
        public double EstimatedCaloriesKcal { get; set; }
        public double EstimatedCalories { get; set; }
    }
}
