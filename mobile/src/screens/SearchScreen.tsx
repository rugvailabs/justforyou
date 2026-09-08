/**
 * Search: query, filters, results, and a real "near me".
 *
 * The web version keeps its state in the URL, which is what makes a result set
 * shareable. There is no URL here, so the state lives in the screen and the
 * route params are only the starting point - what Home handed over.
 *
 * "Near me" is the one genuinely different piece. The browser asks for a
 * position and gets one or an error; expo-location has a permission that can be
 * denied once, denied forever, or granted while location services are switched
 * off at the OS level, and each of those needs different words. Falling back
 * silently to an unlocated search would be worse than saying what happened.
 */

import React, { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import Alert from "../components/Alert";
import BusinessCard from "../components/BusinessCard";
import Button from "../components/Button";
import Field from "../components/Field";
import { Badge } from "../components/Badge";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { searchBusinesses } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { color, radius, space, type } from "../theme";
import type { SearchStackParamList } from "../navigation/types";
import type { BusinessSearchParams, BusinessSort, SearchResponse } from "../lib/types";

type Props = NativeStackScreenProps<SearchStackParamList, "Search">;

/** Same radius the web app's Near me uses, so both apps mean the same thing. */
const NEAR_ME_RADIUS_KM = 25;

const SORTS: { value: BusinessSort; label: string }[] = [
  { value: "relevance", label: "Relevant" },
  { value: "rating", label: "Top rated" },
  { value: "reviews", label: "Most reviewed" },
  { value: "name", label: "A–Z" },
  { value: "newest", label: "Newest" },
];

const MIN_RATINGS = [
  { value: undefined, label: "Any rating" },
  { value: 3, label: "3★ and up" },
  { value: 4, label: "4★ and up" },
  { value: 4.5, label: "4.5★ and up" },
];

interface Point {
  lat: number;
  lng: number;
}

export default function SearchScreen({
  route,
  navigation,
}: Props): React.JSX.Element {
  const initial = route.params ?? {};

  const [query, setQuery] = useState(initial.q ?? "");
  // Committed separately from `query`: searching on every keystroke would fire
  // a request per letter over a mobile connection.
  const [submitted, setSubmitted] = useState(initial.q ?? "");
  const [categorySlug, setCategorySlug] = useState(initial.category_slug);
  const [minRating, setMinRating] = useState<number | undefined>(undefined);
  const [sort, setSort] = useState<BusinessSort>("relevance");
  const [point, setPoint] = useState<Point | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async (): Promise<SearchResponse> => {
    const params: BusinessSearchParams = {
      q: submitted || undefined,
      category_slug: categorySlug,
      min_rating: minRating,
      // The API 422s on sort=distance without a point, so the two move together.
      sort: point !== null ? "distance" : sort,
      lat: point?.lat,
      lng: point?.lng,
      radius_km: point !== null ? NEAR_ME_RADIUS_KM : undefined,
      page,
      page_size: 20,
    };
    return searchBusinesses(params);
  }, [submitted, categorySlug, minRating, sort, point, page]);

  const { data, error, loading, refreshing, reload } = useAsync<SearchResponse>(
    load,
    [submitted, categorySlug, minRating, sort, point, page],
  );

  /** Any change to the filters starts again at page 1. */
  const resetTo = useCallback((apply: () => void) => {
    setPage(1);
    apply();
  }, []);

  const useMyLocation = useCallback(async (): Promise<void> => {
    setLocating(true);
    setLocationError(null);
    try {
      const { status, canAskAgain } =
        await Location.requestForegroundPermissionsAsync();

      if (status !== Location.PermissionStatus.GRANTED) {
        setLocationError(
          canAskAgain
            ? "Location permission was declined. Search by city instead, or allow location and try again."
            : "Location is blocked for this app. Turn it on in Settings, or search by city instead.",
        );
        return;
      }

      // Balanced, not Highest: a directory needs the right neighbourhood, not
      // the right doorstep, and the cheaper fix returns much faster indoors.
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      resetTo(() =>
        setPoint({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      );
    } catch {
      // Thrown when location services are off device-wide, which permission
      // status does not tell us.
      setLocationError(
        "Could not get a location fix. Check that location services are on.",
      );
    } finally {
      setLocating(false);
    }
  }, [resetTo]);

  const clearLocation = useCallback(() => {
    setLocationError(null);
    resetTo(() => setPoint(null));
  }, [resetTo]);

  // Home's "Near me" button opens this screen already asking for a fix.
  useEffect(() => {
    if (initial.nearMe === true) void useMyLocation();
    // Only on the params that arrived with the navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.nearMe]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <View style={styles.screen}>
      <View style={styles.controls}>
        <Field
          value={query}
          onChangeText={setQuery}
          placeholder="Plumbers, dentists, restaurants…"
          returnKeyType="search"
          autoCorrect={false}
          onSubmitEditing={() => resetTo(() => setSubmitted(query.trim()))}
          accessibilityLabel="Search listings"
        />

        <View style={styles.row}>
          <Button
            onPress={() => resetTo(() => setSubmitted(query.trim()))}
            style={styles.grow}
          >
            Search
          </Button>
          {point === null ? (
            <Button
              variant="secondary"
              busy={locating}
              onPress={() => void useMyLocation()}
              style={styles.grow}
            >
              {locating ? "Locating…" : "📍 Near me"}
            </Button>
          ) : (
            <Button variant="secondary" onPress={clearLocation} style={styles.grow}>
              Clear location
            </Button>
          )}
        </View>

        {locationError !== null ? (
          <Alert tone="warning">{locationError}</Alert>
        ) : null}

        {/* Chips rather than the web's selects: a native picker for five
            options costs two taps and a modal. */}
        <FlatList
          horizontal
          data={MIN_RATINGS}
          keyExtractor={(item) => String(item.value ?? "any")}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item }) => (
            <Chip
              label={item.label}
              selected={minRating === item.value}
              onPress={() => resetTo(() => setMinRating(item.value))}
            />
          )}
        />

        {point === null ? (
          <FlatList
            horizontal
            data={SORTS}
            keyExtractor={(item) => item.value}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            renderItem={({ item }) => (
              <Chip
                label={item.label}
                selected={sort === item.value}
                onPress={() => resetTo(() => setSort(item.value))}
              />
            )}
          />
        ) : (
          <View style={styles.chipRow}>
            <Badge tone="info">{`Nearest first, within ${NEAR_ME_RADIUS_KM} km`}</Badge>
          </View>
        )}

        {categorySlug !== undefined ? (
          <View style={styles.chipRow}>
            <Chip
              label={`Category: ${categorySlug} ✕`}
              selected
              onPress={() => resetTo(() => setCategorySlug(undefined))}
            />
          </View>
        ) : null}
      </View>

      {loading ? (
        <Loading label="Searching…" />
      ) : error !== null ? (
        <ErrorState
          error={error}
          fallback="Could not run that search."
          onRetry={() => void reload()}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.results}
          refreshing={refreshing}
          onRefresh={() => void reload(true)}
          ListHeaderComponent={
            <Text style={styles.count}>
              {total.toLocaleString("en-CA")}{" "}
              {total === 1 ? "listing" : "listings"}
              {point !== null ? " near you" : ""}
            </Text>
          }
          renderItem={({ item }) => (
            <BusinessCard
              business={item}
              onPress={() =>
                navigation.navigate("Business", {
                  slug: item.slug,
                  name: item.name,
                })
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No listings match that"
              body={
                point !== null
                  ? `Nothing within ${NEAR_ME_RADIUS_KM} km. Try clearing the location, or a broader search.`
                  : "Try a different term, or clear the filters."
              }
            />
          }
          ListFooterComponent={
            data !== null && data.total_pages > 1 ? (
              <View style={styles.pager}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!data.has_prev}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Text style={styles.pageLabel}>
                  Page {data.page} of {data.total_pages}
                </Text>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!data.has_next}
                  onPress={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Button
      size="sm"
      variant={selected ? "primary" : "secondary"}
      onPress={onPress}
      style={styles.chip}
    >
      {label}
    </Button>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  controls: {
    gap: space.sm,
    padding: space.lg,
    paddingBottom: space.sm,
    backgroundColor: color.surface,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  row: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
  chipRow: { gap: space.sm, paddingVertical: 2 },
  chip: { borderRadius: radius.pill },
  results: { padding: space.lg, gap: space.sm, paddingBottom: space.xxl },
  count: {
    fontSize: type.small.fontSize,
    color: color.subtle,
    marginBottom: space.xs,
  },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: space.lg,
  },
  pageLabel: { fontSize: type.small.fontSize, color: color.muted },
});
