import { useQueryClient } from "@tanstack/react-query";
import { type NextPage } from "next";
import Head from "next/head";
import { Dispatch, useCallback, useMemo, useReducer, useState } from "react";

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
          {event.responses.length > 100 && (
            <Sheet title="Summary" wide>
              <Summary responses={event.responses} options={event.options} />
            </Sheet>
          )}
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

function rankBySortOrder<T>(
  arr: Array<T>,
  fn: (a: T) => number | null | undefined
): Array<{ item: T; rank: number }> {
  const sorted = sortByNullishComparator(arr, fn);
  const baseRanking = sorted.map((item, i) => ({ item, rank: i }));
  // We need to find equal items and assign them the same rank
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
    if (fn(item.item) === fn(lastItem.item)) {
      item.rank = lastItem.rank;
    } else {
      item.rank = lastItem.rank + 1;
    }
    result.push(item);
  }
  return result;
}

type LabeledResponses = Map<
  string,
  {
    leastNumberOfNosRank: number;
    leastNumberOfNosMaybesRank: number;
    bestScoreRank: number;
    overallRank: number;
  }
>;

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
    const rankingComponents = [
      numberOfNosRank,
      numberOfNosMaybesRank,
      bestScoreRank,
    ];
    const aggregateRankScore = rankingComponents
      .map((x, i) => i * numberOfOptions + x.rank)
      .reduce((acc, x) => acc + x, 0);
    return aggregateRankScore;
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
      const ent: [
        string,
        {
          leastNumberOfNosRank: number;
          leastNumberOfNosMaybesRank: number;
          bestScoreRank: number;
          overallRank: number;
        }
      ] = [
        x,
        {
          leastNumberOfNosRank,
          leastNumberOfNosMaybesRank,
          bestScoreRank,
          overallRank,
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
    const pref = responsesPreferenceSet.get(opt.optionId) ?? new Map();
    pref.set(opt.preference, (pref.get(opt.preference) ?? 0) + 1);
  }
  return responsesPreferenceSet;
}

function Summary({
  responses,
  options,
}: {
  responses: Response[];
  options: Option[];
}) {
  const labels = useLabeledResponses(options, responses);
  const optionEl = options.map((x) => {
    const label = labels.get(x.id);
    if (label == null) {
      throw new Error("Could not find label");
    }
    return (
      <div key={x.id}>
        <div>{x.date}</div>
        <div>BS{label.bestScoreRank}</div>
        <div>LN{label.leastNumberOfNosRank}</div>
        <div>LN+M{label.leastNumberOfNosMaybesRank}</div>
      </div>
    );
  });

  return <div>{optionEl}</div>;
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
  // If no responses, show a message
  if (responses.length === 0) {
    return <div className="w-full text-center">No responses yet</div>;
  }

  const m = new Map();
  for (const response of responses) {
    for (const selectedOption of response.selectedOptions) {
      const option = options.find((o) => o.id === selectedOption.optionId);
      if (option == null) {
        continue;
      }
      const key = option.date;
      const value = m.get(key) ?? [];
      value.push({ selectedOption, respondent: response.respondent });
      m.set(key, value);
    }
  }

  const responsesEl = (
    <ul>
      {responses.map((response) => (
        <li key={response.respondent.name} className="mb-4">
          <div className="flex items-center">
            <div className="flex-grow">{response.respondent.name}</div>
            <div className="flex flex-row gap-3">
              {response.selectedOptions.map((selectedOption) => {
                const option =
                  options.find(
                    (option) => option.id === selectedOption.optionId
                  ) ?? null;
                return (
                  <OptionBadge
                    key={selectedOption.optionId}
                    id={option?.id ?? ""}
                    date={option?.date ?? "Unknown"}
                    responseData={selectedOption}
                  />
                );
              })}
            </div>
          </div>
        </li>
      ))}
    </ul>
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
    (e: PointerEvent) => {
      e.preventDefault();
      if (onClick) {
        onClick(id, e.button == 2 || e.altKey);
      }
    },
    [id, onClick]
  );
  return (
    <button
      onClick={(e) => e.preventDefault()}
      title={titleForPreference(responseData?.preference)}
      onPointerUp={handlePointerUp}
      className={
        "rounded-lg p-2 tabular-nums " +
        backgroundColorForPreference(responseData?.preference)
      }
    >
      {formatDate(date)}
      {responseData != null
        ? preferenceToEmoji(responseData.preference) +
          uncertaintyToEmoji(responseData.uncertain)
        : " "}
    </button>
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
