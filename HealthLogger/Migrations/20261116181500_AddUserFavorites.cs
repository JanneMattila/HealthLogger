using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HealthLogger.Migrations
{
    /// <inheritdoc />
    public partial class AddUserFavorites : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Favorites",
                table: "UserPreferences",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<long>(
                name: "FavoritesVersion",
                table: "UserPreferences",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Favorites",
                table: "UserPreferences");

            migrationBuilder.DropColumn(
                name: "FavoritesVersion",
                table: "UserPreferences");
        }
    }
}
