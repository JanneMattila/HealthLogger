using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HealthLogger.Migrations
{
    /// <inheritdoc />
    public partial class AddConsumptionTime : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<TimeOnly>(
                name: "ConsumptionTime",
                table: "FoodEntries",
                type: "time",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ConsumptionTime",
                table: "FoodEntries");
        }
    }
}
