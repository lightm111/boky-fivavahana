#!/usr/bin/env bash

set -e

GRADLE_FILE="android/app/build.gradle"
PKG_FILE="package.json"
CAP_FILE="capacitor.config.json"

# Extract current values
CUR_VERSION=$(grep '"version"' $PKG_FILE | head -1 | sed -E 's/.*"version": "([^"]+)".*/\1/')
CUR_CODE=$(grep 'versionCode' $GRADLE_FILE | sed -E 's/.*versionCode ([0-9]+).*/\1/')
CUR_NAME=$(grep 'versionName' $GRADLE_FILE | sed -E 's/.*versionName "([^"]+)".*/\1/')

echo "Current version:"
echo "  versionName: $CUR_NAME"
echo "  versionCode: $CUR_CODE"
echo

read -p "New versionName: " NEW_VERSION
read -p "New versionCode: " NEW_CODE

echo
echo "Updating files..."

# Update package.json
sed -i -E "s/\"version\": \"[^\"]+\"/\"version\": \"$NEW_VERSION\"/" $PKG_FILE

# Update capacitor.config.json
sed -i -E "s/\"version\": \"[^\"]+\"/\"version\": \"$NEW_VERSION\"/" $CAP_FILE

# Update build.gradle
sed -i -E "s/versionName \"[^\"]+\"/versionName \"$NEW_VERSION\"/" $GRADLE_FILE
sed -i -E "s/versionCode [0-9]+/versionCode $NEW_CODE/" $GRADLE_FILE

echo "Done."
echo
echo "New values:"
echo "  versionName: $NEW_VERSION"
echo "  versionCode: $NEW_CODE"