import { GetServerSideProps } from 'next'
import { ParsedUrlQuery } from 'querystring'
import { IOption, IPoll, IVote } from '../types/tables'
import { useMemo, useState } from 'react'
import ViewOption from '../components/ViewOption'
import { useSubscription } from 'react-supabase'
import { useRouter } from 'next/router'
import pluralize from 'pluralize'
import { DateTime } from 'luxon'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBolt,
  faCircleNotch,
  faLock,
} from '@fortawesome/free-solid-svg-icons'
import VoteOption from '../components/VoteOption'
import { getClientIp } from 'request-ip'
import { adminSupabase } from '../lib/adminSupabaseClient'
import TimeSince from '../components/TimeSince'
import Head from 'next/head'
import { Main } from '../components/Primitives'

type route = ParsedUrlQuery & {
  poll_id: string
}

const Poll: React.FC<{
  poll: Pick<IPoll, 'question' | 'created_at' | 'colour'>
  inital_options: IOption[]
  inital_voted: boolean
}> = ({ poll, inital_options, inital_voted }) => {
  const { poll_id } = useRouter().query as route
  const [options, setOptions] = useState(inital_options)

  useSubscription<IOption>(
    payload => {
      console.log(payload)
      setOptions(prevOptions => {
        const foundIndex = options.findIndex(x => x.id == payload.new.id)
        const copy = prevOptions.slice()
        copy[foundIndex] = payload.new
        return copy
      })
    },
    {
      event: 'UPDATE',
      table: `options:owner=eq.${poll_id}`,
    }
  )

  const total_votes = useMemo(
    () => options.reduce((prev, option) => prev + option.votes, 0),
    [options]
  )
  const [voted, setVoted] = useState(inital_voted)
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)

  return (
    <Main>
      <Head>
        <title>{poll.question} | Strawpoll</title>
        <meta
          name="description"
          content={`Give your vote on '${poll.question}'!`}
        />
      </Head>

      <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight dark:text-slate-200">
        {poll.question}
      </h1>

      <div className="flex justify-between sm:text-2xl">
        <span>{pluralize('votes', total_votes, true)}</span>
        <TimeSince dateTime={DateTime.fromISO(poll.created_at)} />
      </div>

      <hr className="my-2 border-slate-500 dark:border-slate-400" />

      <div className="flex flex-col gap-3 my-3">
        {options.map(option =>
          voted ? (
            <ViewOption
              max={total_votes}
              key={option.id}
              option={option}
              colour={poll.colour}
            />
          ) : (
            <VoteOption
              key={option.id}
              option={option}
              setSelected={setSelected}
              selected={selected}
              colour={poll.colour}
            />
          )
        )}
      </div>

      {voted ? (
        <div className="flex justify-between">
          <span>
            <FontAwesomeIcon className="mr-2 " icon={faBolt} />
            Live
          </span>
          <span>
            IP Protected
            <FontAwesomeIcon className="ml-2" icon={faLock} />
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            className={`text-white bg-${poll.colour}-700 hover:bg-${poll.colour}-800 focus:ring-4 focus:ring-${poll.colour}-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-${poll.colour}-600 dark:hover:bg-${poll.colour}-700 focus:outline-none dark:focus:ring-${poll.colour}-800 disabled:dark:bg-slate-700 transition-colors`}
            disabled={loading || !selected}
            onClickCapture={async () => {
              setLoading(true)
              await fetch(`/api/${selected}`)
              setVoted(true)
              setLoading(false)
            }}>
            {!selected ? (
              <>Choose an option</>
            ) : loading ? (
              <>
                <FontAwesomeIcon
                  className="animate-spin mr-2"
                  icon={faCircleNotch}
                />
                Voting...
              </>
            ) : (
              `Vote ${options.find(option => option.id === selected)!.option}`
            )}
          </button>
          <span>
            <FontAwesomeIcon className="mr-2" icon={faLock} />
            Your IP is saved for protection
          </span>
        </div>
      )}
    </Main>
  )
}

const supabase = adminSupabase
export const getServerSideProps: GetServerSideProps = async context => {
  const { poll_id } = context.query as route
  const ip = getClientIp(context.req)

  const [polls_query, options_query, ip_query] = await Promise.all([
    supabase
      .from<IPoll>('polls')
      .select('question,created_at,colour')
      .filter('id', 'eq', poll_id),
    supabase
      .from<IOption>('options')
      .select('option,id,votes')
      .filter('owner', 'eq', poll_id),
    supabase
      .from<IVote>('votes')
      .select('choice')
      .filter('poll_id', 'eq', poll_id)
      .filter('ip', 'eq', ip)
      .limit(1)
      .single(),
  ])

  if (
    polls_query.error ||
    options_query.error ||
    options_query.body.length === 0
  ) {
    return {
      notFound: true,
    }
  }

  return {
    props: {
      poll: polls_query.body[0],
      inital_options: options_query.body,
      inital_voted: ip_query.data !== null,
    },
  }
}

export default Poll
