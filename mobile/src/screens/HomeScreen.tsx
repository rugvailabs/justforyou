/**
 * Home: hero, search bar and the category grid - web/app/page.tsx on a phone.
 *
 * Same three panels in the same order, and the same independent-failure rule:
 * categories and the top-rated strip are loaded separately, so a backend that
 * is slow on one query does not blank the whole screen.
 */

import React, { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import BusinessCard from "../components/BusinessCard";
import Button from "../components/Button";
import Card from "../components/Card";
import Field from "../components/Field";
import { Loading } from "../components/States";
import Alert from "../components/Alert";
import { getCategories, searchBusinesses } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { errorMessage } from "../components/States";
import { color, radius, space, type } from "../theme";
import type { HomeStackParamList, RootTabParamList } from "../navigation/types";
import type { BusinessListItem, Category } from "../lib/types";

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, "Home">,
  BottomTabScreenProps<RootTabParamList>
>;

interface HomeData {
  categories: Category[];
  categoriesError: unknown;
  featured: BusinessListItem[];
}

export default function HomeScreen({ navigation }: Props): React.JSX.Element {
  const [query, setQuery] = useState("");

  const load = useCallback(async (): Promise<HomeData> => {
    const [categories, featured] = await Promise.allSettled([
      getCategories(),
      searchBusinesses({ sort: "rating", page_size: 3, min_rating: 4.5 }),
    ]);
    return {
      categories: categories.status === "fulfilled" ? categories.value : [],
      categoriesError:
        categories.status === "rejected" ? categories.reason : null,
      featured: featured.status === "fulfilled" ? featured.value.items : [],
    };
  }, []);

  const { data, loading, refreshing, reload } = useAsync<HomeData>(load, []);

  /** Search lives in its own tab, so Home hands the query over and switches. */
  const goToSearch = useCallback(
    (params: { q?: string; category_slug?: string; nearMe?: boolean }) => {
      navigation.navigate("SearchTab", { screen: "Search", params });
    },
    [navigation],
  );

  const openBusiness = useCallback(
    (slug: string, name: string) => {
      navigation.navigate("Business", { slug, name });
    },
    [navigation],
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} />
      }
    >
      <Text style={styles.hero}>Find local businesses across Metro Vancouver</Text>
      <Text style={styles.lede}>
        Search plumbers, dentists, restaurants and more. Filter by city and
        rating, or use your location to find what is closest.
      </Text>

      <View style={styles.searchBar}>
        <Field
          value={query}
          onChangeText={setQuery}
          placeholder="Plumbers, dentists, restaurants…"
          returnKeyType="search"
          autoCorrect={false}
          onSubmitEditing={() => goToSearch({ q: query.trim() || undefined })}
          accessibilityLabel="What are you looking for?"
        />
        <View style={styles.searchButtons}>
          <Button
            onPress={() => goToSearch({ q: query.trim() || undefined })}
            style={styles.grow}
          >
            Search
          </Button>
          <Button
            variant="secondary"
            onPress={() => goToSearch({ nearMe: true })}
            style={styles.grow}
            accessibilityLabel="Search near my location"
          >
            📍 Near me
          </Button>
        </View>
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Browse by category</Text>
        <Text style={styles.link} onPress={() => goToSearch({})}>
          See all listings
        </Text>
      </View>

      {loading ? (
        <Loading label="Loading categories…" />
      ) : data?.categoriesError ? (
        <Alert tone="warning" title="Categories are unavailable">
          {errorMessage(data.categoriesError, "Please pull to refresh.")}
        </Alert>
      ) : (data?.categories.length ?? 0) === 0 ? (
        <Card>
          <Text style={styles.body}>
            No categories yet. Seed the backend with python -m scripts.seed.
          </Text>
        </Card>
      ) : (
        <View style={styles.grid}>
          {data?.categories.map((category) => (
            <Card
              key={category.id}
              style={styles.tile}
              onPress={() => goToSearch({ category_slug: category.slug })}
              accessibilityLabel={`${category.name}, ${category.business_count} listings`}
            >
              <Text style={styles.tileIcon}>{category.icon ?? "•"}</Text>
              <Text style={styles.tileName} numberOfLines={1}>
                {category.name}
              </Text>
              <Text style={styles.tileCount}>
                {category.business_count}{" "}
                {category.business_count === 1 ? "listing" : "listings"}
              </Text>
            </Card>
          ))}
        </View>
      )}

      {(data?.featured.length ?? 0) > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top rated right now</Text>
          <View style={styles.list}>
            {data?.featured.map((business) => (
              <BusinessCard
                key={business.id}
                business={business}
                onPress={() => openBusiness(business.slug, business.name)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  hero: {
    fontSize: type.display.fontSize,
    lineHeight: type.display.lineHeight,
    fontWeight: "700",
    color: color.ink,
  },
  lede: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.muted,
    marginTop: -space.sm,
  },
  searchBar: { gap: space.sm },
  searchButtons: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
  section: { gap: space.md },
  sectionHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: type.title.fontSize,
    fontWeight: "700",
    color: color.ink,
  },
  link: {
    fontSize: type.small.fontSize,
    color: color.body,
    textDecorationLine: "underline",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: {
    // Two per row at 375pt, three on a tablet, without a media query.
    flexGrow: 1,
    flexBasis: 150,
    alignItems: "center",
    gap: 2,
    borderRadius: radius.lg,
    paddingVertical: space.lg,
  },
  tileIcon: { fontSize: 24 },
  tileName: {
    fontSize: type.body.fontSize,
    fontWeight: "600",
    color: color.ink,
    marginTop: space.xs,
  },
  tileCount: { fontSize: type.small.fontSize, color: color.subtle },
  list: { gap: space.sm },
  body: {
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    color: color.muted,
  },
});
