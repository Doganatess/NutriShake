import { DailyPlan, MealAnalysis, WeightEntry, UserProfile, NutritionStats, Shake } from '../types.js';
import { INGREDIENT_MAP, canonicalIngredientId } from '../data/ingredients.js';

export interface IngredientAffinity {
  ingredientId: string;
  name: string;
  icon: string;
  score: number; // how many times this ingredient appeared in a favorited or love/like-rated shake
}

/**
 * Learns which ingredients the user actually enjoys, from two signals they've already
 * given us: shakes they explicitly favorited (heart icon), and shakes they rated
 * "love" or "like" (❤️/👍) in a past daily plan. Counts how often each canonical
 * ingredient appears across those shakes — a higher count means it shows up in more
 * things the user has liked, not just once.
 *
 * Used two ways:
 * 1. Silently: recipeCompositionEngine.ts nudges ingredient selection toward these
 *    when building new shakes (client-side deterministic path).
 * 2. Visibly: SettingsView.tsx shows the top ones as "En Çok Sevdiklerin".
 */
export function getIngredientAffinityScores(
  favorites: Shake[],
  plans: Record<string, DailyPlan>
): IngredientAffinity[] {
  const counts = new Map<string, number>();

  const countShakeIngredients = (shake: Shake) => {
    for (const item of shake.ingredients) {
      const canonId = canonicalIngredientId(item.ingredientId);
      if (canonId === 'other_water') continue; // water isn't a "taste preference"
      counts.set(canonId, (counts.get(canonId) || 0) + 1);
    }
  };

  favorites.forEach(countShakeIngredients);

  Object.values(plans).forEach((plan) => {
    plan.shakes?.forEach((shake) => {
      if (shake.rating === 'love' || shake.rating === 'like') {
        countShakeIngredients(shake);
      }
    });
  });

  return Array.from(counts.entries())
    .map(([ingredientId, score]) => {
      const ing = INGREDIENT_MAP[ingredientId];
      return {
        ingredientId,
        name: ing?.name || ingredientId,
        icon: ing?.icon || '🥣',
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Statistics Engine (Requirement 32)
 * Computes deep, authentic nutritional and behavioral statistics from user data.
 */
export function calculateNutritionStats(
  profile: UserProfile | null,
  plans: Record<string, DailyPlan>,
  meals: MealAnalysis[],
  weights: WeightEntry[],
  favorites: Shake[],
  dislikedShakes: { name: string; ingredients: string[]; date: string }[]
): NutritionStats {
  const planList = Object.values(plans);
  const completedShakes: Shake[] = [];

  planList.forEach((p) => {
    p.shakes.forEach((s) => {
      if (s.isCompleted) {
        completedShakes.push(s);
      }
    });
  });

  // Calculate daily totals by date
  const dates = new Set<string>();
  planList.forEach((p) => dates.add(p.date));
  meals.forEach((m) => dates.add(m.date));

  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;

  dates.forEach((date) => {
    const dayPlan = plans[date];
    const dayMeals = meals.filter((m) => m.date === date);

    const mealKcal = dayMeals.reduce((acc, m) => acc + (m.estimatedCalories || 0), 0);
    const mealProtein = dayMeals.reduce((acc, m) => acc + (m.protein || 0), 0);
    const mealCarbs = dayMeals.reduce((acc, m) => acc + (m.carbs || 0), 0);
    const mealFat = dayMeals.reduce((acc, m) => acc + (m.fat || 0), 0);

    const shakeKcal = dayPlan?.shakes.filter((s) => s.isCompleted).reduce((acc, s) => acc + s.estimatedCalories, 0) || 0;
    const shakeProtein = dayPlan?.shakes.filter((s) => s.isCompleted).reduce((acc, s) => acc + s.protein, 0) || 0;
    const shakeCarbs = dayPlan?.shakes.filter((s) => s.isCompleted).reduce((acc, s) => acc + s.carbs, 0) || 0;
    const shakeFat = dayPlan?.shakes.filter((s) => s.isCompleted).reduce((acc, s) => acc + s.fat, 0) || 0;

    totalCalories += mealKcal + shakeKcal;
    totalProtein += mealProtein + shakeProtein;
    totalCarbs += mealCarbs + shakeCarbs;
    totalFat += mealFat + shakeFat;
  });

  const dayCount = Math.max(1, dates.size);
  const avgDailyCalories = Math.round(totalCalories / dayCount);
  const avgDailyProtein = Math.round((totalProtein / dayCount) * 10) / 10;
  const avgDailyCarbs = Math.round((totalCarbs / dayCount) * 10) / 10;
  const avgDailyFat = Math.round((totalFat / dayCount) * 10) / 10;

  const totalShakeCalories = completedShakes.reduce((acc, s) => acc + s.estimatedCalories, 0);
  const avgShakeCalories = completedShakes.length > 0 ? Math.round(totalShakeCalories / completedShakes.length) : 0;

  // Most used ingredients count
  const ingredientFrequency: Record<string, number> = {};
  completedShakes.forEach((s) => {
    s.ingredients.forEach((item) => {
      ingredientFrequency[item.ingredientId] = (ingredientFrequency[item.ingredientId] || 0) + 1;
    });
  });

  const mostUsedIngredients = Object.entries(ingredientFrequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([id, count]) => {
      const ing = INGREDIENT_MAP[id];
      return {
        id,
        name: ing?.name || id,
        count,
        icon: ing?.icon || '🥣',
      };
    });

  // Top Favorite Shakes
  const topFavoriteShakes = favorites.slice(0, 5).map((f) => ({
    name: f.name,
    count: f.estimatedCalories,
  }));

  // Most Rejected Shakes
  const mostRejectedShakes = dislikedShakes.slice(0, 5).map((d) => ({
    name: d.name,
  }));

  // Weight Statistics
  const sortedWeights = [...weights].sort((a, b) => (a.date > b.date ? 1 : -1));
  const currentWeight = sortedWeights.length > 0 ? sortedWeights[sortedWeights.length - 1].weight : (profile?.currentWeight || 75);
  const startWeight = sortedWeights.length > 0 ? sortedWeights[0].weight : (profile?.currentWeight || 75);
  const targetWeight = profile?.targetWeight || 70;
  const netChange = Math.round((currentWeight - startWeight) * 10) / 10;
  const remainingToTarget = Math.round((targetWeight - currentWeight) * 10) / 10;

  // 7-day & 14-day change
  let sevenDayChange = 0;
  let fourteenDayChange = 0;

  if (sortedWeights.length >= 2) {
    const latestDate = new Date(sortedWeights[sortedWeights.length - 1].date);
    const sevenDaysAgo = new Date(latestDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(latestDate.getTime() - 14 * 24 * 60 * 60 * 1000);

    const weight7 = sortedWeights.find((w) => new Date(w.date) >= sevenDaysAgo);
    if (weight7) {
      sevenDayChange = Math.round((currentWeight - weight7.weight) * 10) / 10;
    }

    const weight14 = sortedWeights.find((w) => new Date(w.date) >= fourteenDaysAgo);
    if (weight14) {
      fourteenDayChange = Math.round((currentWeight - weight14.weight) * 10) / 10;
    }
  }

  return {
    avgDailyCalories,
    avgDailyProtein,
    avgDailyCarbs,
    avgDailyFat,
    avgShakeCalories,
    totalCompletedShakes: completedShakes.length,
    topFavoriteShakes,
    mostUsedIngredients,
    mostRejectedShakes,
    weightStats: {
      currentWeight,
      startWeight,
      targetWeight,
      netChange,
      remainingToTarget,
      sevenDayChange,
      fourteenDayChange,
    },
  };
}

export function computeNutritionStats(
  dailyPlans: Record<string, DailyPlan>,
  meals: MealAnalysis[],
  calorieGoal: number,
  timeRange = 7
) {
  const plans = Object.values(dailyPlans);
  let totalCalories = 0;
  let daysWithinTarget = 0;
  let daysCounted = 0;
  let completedShakesCount = 0;
  let totalPlannedShakesCount = 0;
  const ingredientCounts: Record<string, number> = {};

  plans.forEach((plan) => {
    let dayCalories = 0;
    const dayMeals = meals.filter((m) => m.date === plan.date);
    dayMeals.forEach((m) => {
      dayCalories += m.estimatedCalories || 0;
    });

    plan.shakes?.forEach((shake) => {
      totalPlannedShakesCount++;
      if (shake.isCompleted) {
        completedShakesCount++;
        dayCalories += shake.estimatedCalories || 0;
      }
      shake.ingredients?.forEach((item) => {
        ingredientCounts[item.ingredientId] = (ingredientCounts[item.ingredientId] || 0) + 1;
      });
    });

    totalCalories += dayCalories;
    daysCounted++;

    if (calorieGoal > 0 && Math.abs(dayCalories - calorieGoal) <= 200) {
      daysWithinTarget++;
    }
  });

  const count = Math.max(1, daysCounted);
  const averageCalories = Math.round(totalCalories / count);
  const adherenceRate = Math.round((daysWithinTarget / count) * 100);

  const topIngredients = Object.entries(ingredientCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([ingredientId, count]) => ({ ingredientId, count }));

  return {
    averageCalories,
    adherenceRate,
    completedShakesCount,
    totalPlannedShakesCount,
    topIngredients,
  };
}

export function computeWeightStats(weights: WeightEntry[], targetWeight?: number) {
  const sorted = [...weights].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const current = sorted.length > 0 ? sorted[sorted.length - 1].weight : 0;
  const first = sorted.length > 0 ? sorted[0].weight : current;
  const totalChangeKg = Math.round((current - first) * 10) / 10;

  let weeklyVelocityKg = 0;
  if (sorted.length >= 2) {
    const days = (new Date(sorted[sorted.length - 1].date).getTime() - new Date(sorted[0].date).getTime()) / (1000 * 3600 * 24);
    if (days >= 7) {
      weeklyVelocityKg = Math.round(((current - first) / (days / 7)) * 10) / 10;
    } else {
      weeklyVelocityKg = Math.round((current - first) * 10) / 10;
    }
  }

  const remainingToTargetKg = targetWeight ? Math.round(Math.abs(targetWeight - current) * 10) / 10 : null;

  return {
    currentWeight: current,
    totalChangeKg,
    weeklyVelocityKg,
    remainingToTargetKg,
  };
}
