import { useQueryClient } from "@tanstack/react-query";
import { type GetServerSidePropsContext, type NextPage } from "next";
import Head from "next/head";
import {
  useCallback,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type FormEvent,
  type PointerEvent,
  type PropsWithChildren,
} from "react";
import ErrorMessage from "../../components/ErrorMessage";
import Layout from "../../components/Layout";
import LoadingIndicator from "../../components/LoadingIndicator";
import Sheet from "../../components/Sheet";
import { trpc } from "../../utils/trpc";
function assertNotNull<T>(val: T | null | undefined): T {
  if (val == null) {
    throw new Error("Value is null or undefined");
  }
  return val;
}

const EventPage: NextPage<{ id: string }> = ({ id }) => {
  const query = trpc.events.getEvent.useQuery({
    id,
  });

  const event = query.data;
  return (
    <Layout>
      <LoadingIndicator loading={query.isLoading || !query.isFetched} />
      <ErrorMessage error={query.error} />
      {event != null && (
        <>
          <Head>
            <title>{event.name}</title>
          </Head>
          <Sheet title={event.name} wide>
            <p>{event.description}</p>
          </Sheet>
          <Sheet title="Attendees" wide>
            <Responses responses={event.responses} options={event.options} />
          </Sheet>
          <Sheet title="Select your prefered option" wide>
            <CreateResponse options={event.options} eventId={event.id} />
          </Sheet>
        </>
      )}
    </Layout>
  );
};

function sortByNullishComparator<T>(
  arr: Array<T>,
  fn: (a: T) => number | null | undefined
): Array<T> {
  return arr.sort((a, b) => {
    const aVal = fn(a);
    const bVal = fn(b);
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    return aVal - bVal;
  });
}

type Ranked<T> = { item: T; rank: number };

function rankByComparator<T>(
  arr: Array<T>,
  fn: (a: T, b: T) => number
): Array<Ranked<T>> {
  const sorted = Array.from(arr).sort(fn);
  const baseRanking = sorted.map((item, i) => ({ item, rank: i }));
  const result = [];
  for (const item of baseRanking) {
    if (result.length === 0) {
      result.push(item);
      continue;
    }
    const lastItem = result[result.length - 1];
    if (lastItem == null) {
      throw new Error("lastItem is null");
    }
    if (fn(item.item, lastItem.item) == 0) {
      item.rank = lastItem.rank;
    } else {
      item.rank = lastItem.rank + 1;
    }
    result.push(item);
  }
  return result;
}

type SortOrder<T> = (a: T) => number | null | undefined;
type ComparatorFn<T> = (a: T, b: T) => number;

function sortOrderToComparator<T>(f: SortOrder<T>): ComparatorFn<T> {
  return (a: T, b: T) => {
    const aVal = f(a);
    const bVal = f(b);
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    return aVal - bVal;
  };
}

function rankBySortOrder<T>(arr: Array<T>, fn: SortOrder<T>): Array<Ranked<T>> {
  return rankByComparator(arr, sortOrderToComparator(fn));
}

interface RankLabels {
  leastNumberOfNosRank: number;
  leastNumberOfNosMaybesRank: number;
  bestScoreRank: number;
  overallRank: number;
  strictlySuperiorRank: number;
}

enum Label {
  BestOverall = "Best Overall",
  SecondBest = "Second Best",
  MostPreferred = "Most Preferred",
  FewestNos = "Fewest Nos",
  FewestNosMaybes = "Fewest Nos and Maybes",
  Nothing = "Nothing",
  Suboptimal = "Suboptimal",
}

function labelToEmoji(l: Label): string {
  switch (l) {
    case Label.BestOverall:
      return "🏆";
    case Label.SecondBest:
      return "🥈";
    case Label.FewestNos:
      return "👍";
    case Label.FewestNosMaybes:
      return "👍";
    case Label.MostPreferred:
      return "👍";
    case Label.Nothing:
      return "";
    case Label.Suboptimal:
      return "👎";
  }
}

function backgroundColorForLabel(value: Label): string {
  let background;
  let foreground;
  switch (value) {
    case Label.BestOverall:
      background = "bg-sky-200";
      foreground = "text-sky-800";
      break;
    case Label.SecondBest:
      background = "bg-teal-200";
      foreground = "text-teal-800";
      break;
    case Label.FewestNos:
      background = "bg-emerald-200";
      foreground = "text-emerald-800";
      break;
    case Label.FewestNosMaybes:
      background = "bg-emerald-200";
      foreground = "text-emerald-800";
      break;
    case Label.MostPreferred:
      background = "bg-emerald-200";
      foreground = "text-emerald-800";
      break;
    case Label.Nothing:
      background = "bg-gray-200";
      foreground = "text-gray-800";
      break;
    case Label.Suboptimal:
      background = "bg-red-200";
      foreground = "text-red-800";
      break;
    default:
      background = "bg-gray-200";
      foreground = "text-gray-800";
  }
  return `${background} ${foreground}`;
}

function determineMostSignificantLabel(
  rl: RankLabels,
  numberOfOptions: number
): Label {
  if (rl.overallRank === 0) {
    return Label.BestOverall;
  }
  if (rl.overallRank === 1 && numberOfOptions > 2) {
    return Label.SecondBest;
  }
  if (rl.bestScoreRank === 0) {
    return Label.MostPreferred;
  }
  if (rl.leastNumberOfNosRank === 0) {
    return Label.FewestNos;
  }
  if (rl.leastNumberOfNosMaybesRank === 0) {
    return Label.FewestNosMaybes;
  }
  if (rl.strictlySuperiorRank > 0) {
    return Label.Suboptimal;
  }
  return Label.Nothing;
}

type LabeledResponses = Map<string, RankLabels>;

function labelResponses(
  options: Option[],
  responses: Response[]
): LabeledResponses {
  const numberOfOptions = options.length;
  const allChosenOptions = responses.flatMap((x) => x.selectedOptions);
  const card = responsePreferenceCardianlity(allChosenOptions);
  const leastNumberOfNos = rankBySortOrder(options, (x) => {
    const val = card.get(x.id);
    if (val == null) return null;
    return val.get(-1) ?? 0;
  });
  const leastNumberOfNosMaybes = rankBySortOrder(options, (x) => {
    const val = card.get(x.id);
    if (val == null) return null;
    return (val.get(-1) ?? 0) + (val.get(0) ?? 0);
  });
  const bestScore = rankBySortOrder(options, (x) => {
    const val = card.get(x.id);
    if (val == null) return null;
    const product = Array.from(val.entries()).reduce(
      (acc, [key, value]) => acc + key * value,
      0
    );
    return -product;
  });

  const overall = rankBySortOrder(options, (x) => {
    const numberOfNosRank = leastNumberOfNos.find((y) => y.item.id === x.id);
    const numberOfNosMaybesRank = leastNumberOfNosMaybes.find(
      (y) => y.item.id === x.id
    );
    const bestScoreRank = bestScore.find((y) => y.item.id === x.id);
    if (
      numberOfNosRank == null ||
      numberOfNosMaybesRank == null ||
      bestScoreRank == null
    ) {
      throw new Error("Could not find rank");
    }
    // Least to most important ranking
    const rankingComponents = [
      bestScoreRank,
      numberOfNosMaybesRank,
      numberOfNosRank,
    ];
    const aggregateRankScore = rankingComponents
      .map((x, i) => i * numberOfOptions + x.rank)
      .reduce((acc, x) => acc + x, 0);
    return aggregateRankScore;
  });

  const strictlySuperior = rankByComparator(options, (a, b) => {
    // If A is smaller than B in every dimension, then A is strictly superior to B
    // If A is bigger than B in every dimension, then A is strictly inferior to B
    // If A is bigger than B in some dimensions and smaller in others, then A and B are equal
    const nosComp =
      assertNotNull(leastNumberOfNos.find((x) => x.item.id === a.id)).rank -
      assertNotNull(leastNumberOfNos.find((x) => x.item.id === b.id)).rank;
    const nosMaybesComp =
      assertNotNull(leastNumberOfNosMaybes.find((x) => x.item.id === a.id))
        .rank -
      assertNotNull(leastNumberOfNosMaybes.find((x) => x.item.id === b.id))
        .rank;
    const scoreComp =
      assertNotNull(bestScore.find((x) => x.item.id === a.id)).rank -
      assertNotNull(bestScore.find((x) => x.item.id === b.id)).rank;
    if (nosComp == 0 && nosMaybesComp == 0 && scoreComp == 0) {
      return 0;
    }
    if (nosComp <= 0 && nosMaybesComp <= 0 && scoreComp <= 0) {
      return -1;
    } else if (nosComp >= 0 && nosMaybesComp >= 0 && scoreComp >= 0) {
      return 1;
    } else {
      return 0;
    }
  });

  const items = options
    .map((x) => x.id)
    .map((x) => {
      const leastNumberOfNosMaybesRank = assertNotNull(
        leastNumberOfNosMaybes.find((y) => y.item.id === x)
      ).rank;
      const leastNumberOfNosRank = assertNotNull(
        leastNumberOfNos.find((y) => y.item.id === x)
      ).rank;
      const bestScoreRank = assertNotNull(
        bestScore.find((y) => y.item.id === x)
      ).rank;
      const overallRank = assertNotNull(
        overall.find((y) => y.item.id === x)
      ).rank;
      const strictlySuperiorRank = assertNotNull(
        strictlySuperior.find((y) => y.item.id === x)
      ).rank;
      const ent: [string, RankLabels] = [
        x,
        {
          leastNumberOfNosRank,
          leastNumberOfNosMaybesRank,
          bestScoreRank,
          overallRank,
          strictlySuperiorRank,
        },
      ];
      return ent;
    });

  return new Map(items);
}

function useLabeledResponses(
  options: Option[],
  responses: Response[]
): LabeledResponses {
  return useMemo(
    () => labelResponses(options, responses),
    [options, responses]
  );
}

function responsePreferenceCardianlity(
  allChosenOptions: {
    preference: number;
    uncertain: boolean;
    optionId: string;
  }[]
): Map<string, Map<number, number>> {
  const responsesPreferenceSet = new Map<string, Map<number, number>>();
  for (const opt of allChosenOptions) {
    if (!responsesPreferenceSet.has(opt.optionId)) {
      responsesPreferenceSet.set(opt.optionId, new Map());
    }
    const pref = assertNotNull(responsesPreferenceSet.get(opt.optionId));
    pref.set(opt.preference, (pref.get(opt.preference) ?? 0) + 1);
  }
  return responsesPreferenceSet;
}

interface Option {
  id: string;
  date: string;
}
interface Response {
  respondent: {
    name: string | null;
  };
  selectedOptions: {
    preference: number;
    uncertain: boolean;
    optionId: string;
  }[];
}

function Responses({
  responses,
  options,
}: {
  responses: Response[];
  options: Option[];
}) {
  const labels = useLabeledResponses(options, responses);
  // If no responses, show a message
  if (responses.length === 0) {
    return <div className="w-full text-center">No responses yet</div>;
  }
  const responsesEl = (
    <div
      className="col-gap-4 row-gap-2 grid"
      style={{
        rowGap: "0.5rem",
        columnGap: "1rem",
        gridTemplateColumns: `minmax(5vw, max-content) repeat(${options.length}, 1fr)`,
      }}
    >
      {responses.map((response) => (
        <>
          <div className="align-center font-italics self-center italic">
            {response.respondent.name}
          </div>
          {options
            .map((option) => {
              const selectedOption = response.selectedOptions.find(
                (x) => x.optionId === option.id
              );
              return {
                option,
                selectedOption,
              };
            })
            .map(({ option, selectedOption }) =>
              selectedOption == null ? (
                <div></div>
              ) : (
                <OptionBadge
                  key={assertNotNull(selectedOption).optionId}
                  id={option?.id ?? ""}
                  date={option?.date ?? "Unknown"}
                  responseData={assertNotNull(selectedOption)}
                />
              )
            )}
        </>
      ))}
      <div>Summary</div>
      {Array.from(labels)
        .map(([optionId, data]) => ({
          optionId,
          data,
          label: determineMostSignificantLabel(data, options.length),
        }))
        .map(({ optionId, label }) =>
          label == Label.Nothing ? (
            <div></div>
          ) : (
            <Badge key={optionId} className={backgroundColorForLabel(label)}>
              {label}
              {labelToEmoji(label)}
            </Badge>
          )
        )}
    </div>
  );
  // If there are responses show each response as a row in a list
  return <div>{responsesEl}</div>;
}

const relativeTimeFmt = new Intl.RelativeTimeFormat(undefined, {
  style: "short",
});

const preferenceOptions: {
  label: string;
  emoji: string;
  value: number;
  background: string;
  foreground: string;
}[] = [
  // Doesn't work
  {
    label: "Doesn't work for me",
    emoji: "👎",
    value: -1,
    background: "bg-red-200",
    foreground: "text-red-800",
  },
  // Preferably not
  {
    label: "Preferably not",
    emoji: "😐",
    value: 0,
    background: "bg-yellow-200",
    foreground: "text-yellow-800",
  },
  // Somewhat happy, okay for me
  {
    label: "Okay",
    emoji: "🙂",
    value: 1,
    background: "bg-green-200",
    foreground: "text-green-800",
  },
  // Good for me
  {
    label: "Good",
    emoji: "😄",
    value: 2,
    background: "bg-emerald-200",
    foreground: "text-emerald-800",
  },
  // Great for me
  {
    label: "Great",
    emoji: "😍",
    value: 3,
    background: "bg-teal-200",
    foreground: "text-teal-800",
  },
  // Amazing for me
  {
    label: "Amazing",
    emoji: "🤩",
    value: 4,
    background: "bg-sky-200",
    foreground: "text-sky-800",
  },
];

function preferenceToEmoji(value: number): string {
  return (
    preferenceOptions.find((option) => option.value === value)?.emoji ?? "❓"
  );
}

function nextOptionFor(value: number): {
  label: string;
  value: number;
  emoji: string;
} {
  const option = preferenceOptions.find((option) => option.value === value);
  if (option == null) {
    return assertNotNull(preferenceOptions[0]);
  }
  const index = preferenceOptions.indexOf(option);
  if (index === preferenceOptions.length - 1) {
    return assertNotNull(preferenceOptions[0]);
  }
  return assertNotNull(preferenceOptions[index + 1]);
}

function previousOptionFor(value: number): {
  label: string;
  value: number;
  emoji: string;
} {
  const option = preferenceOptions.find((option) => option.value === value);
  if (option == null) {
    return assertNotNull(preferenceOptions[0]);
  }
  const index = preferenceOptions.indexOf(option);
  if (index === 0) {
    return assertNotNull(preferenceOptions[preferenceOptions.length - 1]);
  }
  return assertNotNull(preferenceOptions[index - 1]);
}

function uncertaintyToEmoji(uncertain: boolean): string {
  return uncertain ? "❓" : "";
}

function backgroundColorForPreference(value: number | undefined): string {
  if (value == null) {
    return "bg-gray-200";
  }
  const opt = preferenceOptions.find((option) => option.value === value);
  if (opt == null) {
    return "bg-gray-200";
  }
  return `${opt.background} ${opt.foreground}`;
}

function titleForPreference(value: number | undefined): string {
  if (value == null) {
    return "Not answered";
  }
  const opt = preferenceOptions.find((option) => option.value === value);
  if (opt == null) {
    return "?";
  }
  return opt.label;
}

function datediff(first: Date, second: Date) {
  return Math.round(
    (second.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)
  );
}

const sameYearFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

const weekdaySameMonth = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
});

const sameWeekFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
});

function formatDate(date: string): string {
  const now = new Date();
  const d = new Date(date);
  const delta = datediff(now, d);
  const sameMonth = now.getMonth() === d.getMonth();
  const sameWeek = delta < 7;
  const nextTwoWeeks = delta < 14;
  const sameYear = now.getFullYear() === d.getFullYear();
  if (sameWeek) {
    return sameWeekFmt.format(d);
  } else if (sameMonth) {
    return weekdaySameMonth.format(d);
  } else if (sameYear) {
    return sameYearFmt.format(d);
  } else {
    return date;
  }
}

function Badge({
  onClick,
  children,
  className,
  title,
}: PropsWithChildren<{
  onClick?: (e: PointerEvent<HTMLButtonElement>) => void;
  title?: string;
  className?: string;
}>) {
  return (
    <button
      onClick={(e) => e.preventDefault()}
      title={title}
      onPointerUp={onClick}
      className={"rounded-lg p-2 tabular-nums " + (className ?? "")}
    >
      {children}
    </button>
  );
}

function OptionBadge({
  date,
  responseData,
  onClick,
  id,
}: {
  date: string;
  id: string;
  responseData: ResponseData | null;
  onClick?: (id: string, reverse: boolean) => void;
}) {
  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (onClick) {
        onClick(id, e.button == 2 || e.altKey);
      }
    },
    [id, onClick]
  );
  return (
    <Badge
      title={titleForPreference(responseData?.preference)}
      onClick={handlePointerUp}
      className={backgroundColorForPreference(responseData?.preference)}
    >
      {formatDate(date)}
      {responseData != null
        ? preferenceToEmoji(responseData.preference) +
          uncertaintyToEmoji(responseData.uncertain)
        : " "}
    </Badge>
  );
}

type CreateResponseProps = {
  options: { id: string; date: string }[];
  eventId: string;
  onCreated?: () => void;
};

interface ResponseData {
  preference: number;
  uncertain: boolean;
  optionId: string;
}

function responseReducer(
  state: Map<string, ResponseData>,
  updated: ResponseData
): Map<string, ResponseData> {
  const newState = new Map(state);
  newState.set(updated.optionId, updated);
  return newState;
}

const emptyMap = new Map<string, ResponseData>();

function responseStateToList(d: Map<string, ResponseData>): ResponseData[] {
  return Array.from(d.values()).sort((x, y) => x.preference - y.preference);
}

function useResponseState(): [ResponseData[], Dispatch<ResponseData>] {
  const [state, disp] = useReducer(responseReducer, emptyMap);
  return [responseStateToList(state), disp];
}

function forId(state: ResponseData[], id: string): ResponseData | null {
  return state.find((x) => x.optionId == id) || null;
}

function CreateResponse({ options, eventId, onCreated }: CreateResponseProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const mutation = trpc.events.addResponse.useMutation({
    onSettled(data, error, variables, context) {
      if (data) {
        queryClient.invalidateQueries([
          ["events", "getEvent"],
          { id: eventId },
        ]);
        if (onCreated) {
          onCreated();
        }
      }
    },
  });
  const [responseState, dispatch] = useResponseState();

  const ready = responseState.length > 0;

  const handleResponse = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (responseState.length < 1) {
        return;
      }
      mutation.mutate({
        eventId,
        options: responseState,
        name,
      });
    },
    [responseState, eventId, mutation, name]
  );
  if (mutation.isError) {
    return (
      <div className="flex flex-col items-center justify-center">
        <h1 className="text-2xl font-bold">Error</h1>
        <p className="text-lg">{mutation.error.message}</p>
      </div>
    );
  }
  if (mutation.isSuccess) {
    return (
      <div className="mt-4 flex flex-col items-center justify-center">
        <h1 className="text-xl">All done!</h1>
        <p className="text-lg">Thanks for your response.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleResponse}>
      <div>
        {/* User to enter their name */}
        <div className="mt-4 mb-4 flex flex-row align-middle">
          <label htmlFor="name" className="mr-2 p-2">
            Name
          </label>

          <input
            type="text"
            name="name"
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            className="rounded-md border border-gray-300 p-2"
          />
        </div>
      </div>
      <div className="space-between mt-8 flex w-full flex-row flex-wrap gap-4">
        {options.map((option) => (
          <OptionBadge
            onClick={(optionId, reverse) => {
              const data = forId(responseState, optionId);
              if (data == null) {
                dispatch({
                  preference: 0,
                  uncertain: false,
                  optionId: optionId,
                });
                return;
              }
              const optionTransformer = reverse
                ? previousOptionFor
                : nextOptionFor;
              const preference = optionTransformer(data.preference).value;
              dispatch({ ...data, preference });
            }}
            key={option.id}
            date={option.date}
            id={option.id}
            responseData={forId(responseState, option.id)}
          />
        ))}
      </div>
      <div className="mt-4">
        <p className="text-gray-500">
          Click the date to toggle your avaliability. Shift click to toggle in
          the other direction.
        </p>
      </div>
      <div className="mt-6 mb-2">
        <input
          type="submit"
          className="text-md hover:text-white-100 rounded-lg bg-blue-500 p-2 text-blue-100 hover:bg-blue-700"
          disabled={!ready}
          value="Submit"
        />
      </div>
    </form>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const id: string = context.params?.id as string;
  if (typeof id !== "string") {
    throw new Error("Id has to be set");
  }
  return {
    props: {
      id,
    },
  };
}

export default EventPage;
