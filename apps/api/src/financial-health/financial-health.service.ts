import type {
  FinancialHealthResponse,
  HealthComponent,
  HealthComponents,
  HealthInsight,
  HealthMetrics,
} from "../../../../packages/contracts/src/financial-health/financial-health.js";
import type { AnalyticsService } from "../analytics/analytics.service.js";
import { buildDateRange } from "../analytics/analytics.service.js";
import type { DateRangeFilter } from "../analytics/analytics.repository.js";

const DISCLAIMER =
  "This score is an application-defined financial wellness indicator, not a professional financial, credit, or regulatory assessment.";

// Clamp value to [0, 100]
function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function component(score: number, weight: number, label: string, explanation: string): HealthComponent {
  return { score: clamp(score), weight, label, explanation };
}

// Savings rate component: score based on savings rate %
// 0% → 0, 10% → 50, 20% → 70, 30%+ → 100
function scoreSavingsRate(savingsRateStr: string | null): HealthComponent {
  if (savingsRateStr === null) {
    return component(50, 0.25, "Savings Rate", "No income data available for this period.");
  }
  const rate = parseFloat(savingsRateStr);
  let score: number;
  if (rate <= 0) score = 0;
  else if (rate < 10) score = rate * 5;
  else if (rate < 20) score = 50 + (rate - 10) * 2;
  else if (rate < 30) score = 70 + (rate - 20) * 3;
  else score = 100;
  return component(score, 0.25, "Savings Rate", `Savings rate is ${rate.toFixed(1)}% of income.`);
}

// Budget adherence: average utilization across budgets
// Under 80% → 100, 80-100% → 70, 100-120% → 30, over 120% → 0
function scoreBudgetAdherence(totalBudgeted: string, totalSpent: string): HealthComponent {
  const budgeted = parseFloat(totalBudgeted);
  if (budgeted === 0) {
    return component(50, 0.20, "Budget Adherence", "No budgets defined.");
  }
  const util = (parseFloat(totalSpent) / budgeted) * 100;
  let score: number;
  if (util <= 80) score = 100;
  else if (util <= 100) score = 100 - (util - 80) * 1.5;
  else if (util <= 120) score = 70 - (util - 100) * 2;
  else score = Math.max(0, 30 - (util - 120));
  return component(score, 0.20, "Budget Adherence", `Budget utilization is ${util.toFixed(1)}%.`);
}

// Goal progress: average progress % across active goals
function scoreGoalProgress(totalTarget: string, totalCurrent: string, activeCount: number): HealthComponent {
  if (activeCount === 0) {
    return component(50, 0.20, "Goal Progress", "No active savings goals.");
  }
  const target = parseFloat(totalTarget);
  if (target === 0) {
    return component(100, 0.20, "Goal Progress", "All goal targets reached.");
  }
  const progress = (parseFloat(totalCurrent) / target) * 100;
  return component(progress, 0.20, "Goal Progress", `Overall goal progress is ${progress.toFixed(1)}%.`);
}

// Cash flow health: positive net → good, negative → poor
function scoreCashFlow(totalIncome: string, totalExpenses: string): HealthComponent {
  const income = parseFloat(totalIncome);
  const expenses = parseFloat(totalExpenses);
  if (income === 0 && expenses === 0) {
    return component(50, 0.20, "Cash Flow", "No transaction data for this period.");
  }
  const net = income - expenses;
  if (income === 0) {
    return component(0, 0.20, "Cash Flow", "No income recorded; expenses present.");
  }
  const ratio = net / income; // -1 to 1
  const score = clamp(50 + ratio * 50);
  return component(score, 0.20, "Cash Flow", `Net cash flow is ${net >= 0 ? "positive" : "negative"} (${((ratio) * 100).toFixed(1)}% of income).`);
}

// Spending stability: rough measure — if only 1 period, neutral
// Multiple periods: standard deviation of monthly expenses relative to mean
function scoreSpendingStability(totalIncome: string, monthlyExpenses: number[]): HealthComponent {
  if (monthlyExpenses.length === 0) {
    return component(50, 0.15, "Spending Stability", "Insufficient data to assess stability.");
  }
  if (monthlyExpenses.length === 1) {
    return component(70, 0.15, "Spending Stability", "Only one period of data available.");
  }
  const mean = monthlyExpenses.reduce((a, b) => a + b, 0) / monthlyExpenses.length;
  if (mean === 0) {
    return component(80, 0.15, "Spending Stability", "Very low spending variability.");
  }
  const variance = monthlyExpenses.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / monthlyExpenses.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // coefficient of variation
  // cv < 0.1 → very stable (100), cv > 0.5 → volatile (0)
  const score = clamp(100 - cv * 200);
  return component(score, 0.15, "Spending Stability", `Monthly expense variability coefficient is ${cv.toFixed(2)}.`);
}

function generateInsights(
  savingsRate: string | null,
  budgetUtil: number,
  netCashFlow: string,
  activeGoals: number,
  goalProgress: string | null,
): HealthInsight[] {
  const insights: HealthInsight[] = [];

  const net = parseFloat(netCashFlow);
  if (net < 0) {
    insights.push({ type: "warning", category: "Cash Flow", message: "Your expenses exceed your income this period. Review your spending." });
  } else if (net > 0) {
    insights.push({ type: "positive", category: "Cash Flow", message: "You have a positive net cash flow this period." });
  }

  if (savingsRate !== null) {
    const rate = parseFloat(savingsRate);
    if (rate < 0) {
      insights.push({ type: "warning", category: "Savings", message: "Negative savings rate: you are spending more than you earn." });
    } else if (rate < 10) {
      insights.push({ type: "warning", category: "Savings", message: `Your savings rate is ${rate.toFixed(1)}%. Aim for 20% or more.` });
    } else if (rate >= 20) {
      insights.push({ type: "positive", category: "Savings", message: `Great savings rate of ${rate.toFixed(1)}%!` });
    }
  } else {
    insights.push({ type: "neutral", category: "Savings", message: "No income recorded. Add income transactions to track your savings rate." });
  }

  if (budgetUtil > 100) {
    insights.push({ type: "warning", category: "Budget", message: `You are over budget (${budgetUtil.toFixed(1)}% utilized). Review your spending categories.` });
  } else if (budgetUtil > 80) {
    insights.push({ type: "warning", category: "Budget", message: `Budget utilization is ${budgetUtil.toFixed(1)}%. You are close to your limit.` });
  } else if (budgetUtil > 0) {
    insights.push({ type: "positive", category: "Budget", message: `Budget utilization is healthy at ${budgetUtil.toFixed(1)}%.` });
  } else {
    insights.push({ type: "neutral", category: "Budget", message: "No budgets set. Create budgets to track your spending limits." });
  }

  if (activeGoals === 0) {
    insights.push({ type: "neutral", category: "Goals", message: "No active savings goals. Set a goal to build your financial future." });
  } else if (goalProgress !== null) {
    const progress = parseFloat(goalProgress);
    if (progress < 25) {
      insights.push({ type: "warning", category: "Goals", message: `Goal progress is ${progress.toFixed(1)}%. Keep contributing to reach your targets.` });
    } else if (progress >= 75) {
      insights.push({ type: "positive", category: "Goals", message: `Excellent goal progress at ${progress.toFixed(1)}%!` });
    }
  }

  return insights;
}

export class FinancialHealthService {
  constructor(private readonly analyticsService: AnalyticsService) {}

  async getFinancialHealth(userId: string, filter: DateRangeFilter): Promise<FinancialHealthResponse> {
    const [summary, cashFlow, budgets, goals] = await Promise.all([
      this.analyticsService.getSummary(userId, filter),
      this.analyticsService.getCashFlow(userId, filter),
      this.analyticsService.getBudgetsAnalytics(userId),
      this.analyticsService.getGoalsAnalytics(userId),
    ]);

    const monthlyExpenses = cashFlow.periods.map((p) => parseFloat(p.expenses));

    const budgetedTotal = parseFloat(budgets.totalBudgeted);
    const budgetUtil = budgetedTotal === 0 ? 0 : (parseFloat(budgets.totalSpent) / budgetedTotal) * 100;

    const goalProgressStr = goals.totalActiveGoals > 0 && parseFloat(goals.totalTargetAmount) > 0
      ? ((parseFloat(goals.totalCurrentAmount) / parseFloat(goals.totalTargetAmount)) * 100).toFixed(2)
      : null;

    const savingsComponent = scoreSavingsRate(summary.savingsRate);
    const budgetComponent = scoreBudgetAdherence(budgets.totalBudgeted, budgets.totalSpent);
    const goalComponent = scoreGoalProgress(goals.totalTargetAmount, goals.totalCurrentAmount, goals.totalActiveGoals);
    const cashFlowComponent = scoreCashFlow(summary.totalIncome, summary.totalExpenses);
    const stabilityComponent = scoreSpendingStability(summary.totalIncome, monthlyExpenses);

    const components: HealthComponents = {
      savingsRate: savingsComponent,
      budgetAdherence: budgetComponent,
      goalProgress: goalComponent,
      cashFlowHealth: cashFlowComponent,
      spendingStability: stabilityComponent,
    };

    // Weighted average
    const overallScore = clamp(
      savingsComponent.score * savingsComponent.weight +
      budgetComponent.score * budgetComponent.weight +
      goalComponent.score * goalComponent.weight +
      cashFlowComponent.score * cashFlowComponent.weight +
      stabilityComponent.score * stabilityComponent.weight,
    );

    const hasSufficientData = summary.transactionCount > 0 || goals.totalActiveGoals > 0;

    const metrics: HealthMetrics = {
      savingsRate: summary.savingsRate,
      netCashFlow: summary.netCashFlow,
      totalIncome: summary.totalIncome,
      totalExpenses: summary.totalExpenses,
      budgetUtilization: budgetedTotal > 0 ? budgetUtil.toFixed(2) : null,
      goalProgressPercentage: goalProgressStr,
      activeGoalCount: goals.totalActiveGoals,
      hasSufficientData,
    };

    const insights = generateInsights(
      summary.savingsRate,
      budgetUtil,
      summary.netCashFlow,
      goals.totalActiveGoals,
      goalProgressStr,
    );

    return {
      overallScore,
      components,
      metrics,
      insights,
      dateRange: summary.dateRange,
      disclaimer: DISCLAIMER,
    };
  }
}
