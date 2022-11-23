import { type NextPage } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { FormEvent, useState } from "react";
import DatePicker, { type DateObject } from "react-multi-date-picker";
import Layout from "../../components/Layout";
import Sheet from "../../components/Sheet";
import { trpc } from "../../utils/trpc";

function NewEventForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState<DateObject[]>([]);
  const mutation = trpc.events.createEvent.useMutation({
    onSuccess: ({ id }) => {
      router.push(`/events/${id}`);
    },
  });
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await mutation.mutateAsync({
      name,
      description,
      options: options.map((o) => o.toDate()),
    });
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="mb-4">
        <label
          className="mb-2 block text-sm font-bold text-gray-700"
          htmlFor="name"
        >
          Name
        </label>
        <input
          className="focus:shadow-outline w-full appearance-none rounded border py-2 px-3 leading-tight text-gray-700 shadow focus:outline-none"
          id="name"
          type="text"
          placeholder="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="mb-4">
        <label
          className="mb-2 block text-sm font-bold text-gray-700"
          htmlFor="description"
        >
          Description
        </label>
        <textarea
          className="focus:shadow-outline w-full appearance-none rounded border py-2 px-3 leading-tight text-gray-700 shadow focus:outline-none"
          id="description"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="mb-4">
        <label className="mb-2 block text-sm font-bold text-gray-700">
          Options
        </label>
        <div className="flex flex-col gap-2">
          <DatePicker
            placeholder="Select dates"
            inputClass="focus:shadow-outline w-full appearance-none rounded border py-2 px-3 leading-tight text-gray-700 shadow focus:outline-none"
            multiple
            onChange={(x) => {
              if (Array.isArray(x)) {
                setOptions(x);
              } else {
                throw new Error("Expected array");
              }
            }}
            value={options}
          />
        </div>

        <input
          type="submit"
          value="Create event"
          disabled={mutation.isLoading}
          className="text-md hover:text-white-100 mt-4 rounded-lg bg-blue-500 p-2 text-blue-100 hover:bg-blue-700"
        />
        {mutation.isError && (
          <div className="text-red-500">{mutation.error.message}</div>
        )}
      </div>
    </form>
  );
}

const NewEvent: NextPage = () => {
  return (
    <>
      <Head>
        <title>New event</title>
      </Head>

      <Layout>
        <Sheet wide title="Create an Event">
          <p className="mb-4">
            To create an event, you need to provide a name, a description, and a
            number of options for you attendees.
          </p>
          <NewEventForm />
        </Sheet>
      </Layout>
    </>
  );
};

export default NewEvent;
