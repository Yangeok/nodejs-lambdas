import { corsSuccessResponse, corsErrorResponse, runWarm } from './utils'
import aws from 'aws-sdk'
import moment from 'moment-timezone'
import { groupSites, groupKeywords } from './constant'

const NODE_ENV = process.env.NODE_ENV
const sqs = new aws.SQS({
  apiVersion: '2012-11-05',
})

const QueueUrl = process.env.QUEUE_URL

const sendMessage = async body => {
  const params = {
    MessageGroupId: 'crawling',
    MessageDeduplicationId: body.site + '-' + new Date().getTime(),
    QueueUrl,
    MessageBody: JSON.stringify(body),
    DelaySeconds: 0,
  }
  await sqs.sendMessage(params).promise()
}

const createLoopJobs = async () => {
  const startDate = moment()
    .subtract(1, 'day')
    .tz('Asia/Seoul')
    .format('YYYY-MM-DD')
  const endDate = moment()
    .subtract(1, 'day')
    .tz('Asia/Seoul')
    .format('YYYY-MM-DD')

  for (let site of groupSites) {
    for (let keyword of groupKeywords) {
      const _index = 'group_raw'
      const body = {
        keyword,
        startDate,
        endDate,
        site,
        _index,
      }
      console.log(body)
      await sendMessage(body)
    }
  }
}

const sendBatchJobs = async (event, context) => {
  try {
    await createLoopJobs()

    return corsSuccessResponse({
      done: true,
    })
  } catch (err) {
    console.log(err)
    return corsErrorResponse({
      done: false,
      err,
    })
  }
}

export default runWarm(sendBatchJobs)
