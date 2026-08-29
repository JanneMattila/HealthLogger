FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["HealthLogger/HealthLogger.csproj", "HealthLogger/"]
RUN dotnet restore "HealthLogger/HealthLogger.csproj"
COPY . .
WORKDIR "/src/HealthLogger"
RUN dotnet build "HealthLogger.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "HealthLogger.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "HealthLogger.dll"]
