import { corsSuccessResponse, corsErrorResponse, runWarm } from './utils'
import aws from 'aws-sdk'
import fetch from 'node-fetch'
import _ from 'lodash'
import { crawlers } from './constant'

const sqs = new aws.SQS({
  apiVersion: '2012-11-05',
})
const QueueUrl = process.env.QUEUE_URL

const checkStatus = res => (res.ok ? true : false)

const getRequest = async crawler => {
  const fetchGetRequest = await fetch(crawler)
  const crawlerStatus = checkStatus(fetchGetRequest)
  console.log(`> crawlerStatus: ${crawlerStatus}`)
  return crawlerStatus
}

const postRequest = (crawler, job, index) => {
  fetch(crawler, {
    method: 'post',
    body: JSON.stringify({ id: job.id, body: job.body }),
    headers: { 'Content-Type': 'application/json' },
  })
  console.log({
    crawler,
    index,
  })
}

const deleteJob = async params => {
  console.log('> delete job...')
  await sqs.deleteMessage(params).promise()
}

const onBatchJobCreated = async (event, context) => {
  const params = {
    QueueUrl,
    MaxNumberOfMessages: 6,
  }

  try {
    const receivedMessage = await sqs
      .receiveMessage(params)
      .promise()
      .then(({ ResponseMetadata, Messages }) => {
        if (Messages !== undefined) {
          return {
            ResponseMetadata,
            Messages: Messages.map(
              ({ Body, MessageId, ReceiptHandle, MD5OfBody }) => ({
                MessageId,
                ReceiptHandle,
                MD5OfBody,
                Body: JSON.parse(Body),
              }),
            ),
          }
        } else {
          return
        }
      })
    if (_.isNil(receivedMessage.Messages)) {
      throw new Error('> there is no msgs...')
    }

    const jobs = receivedMessage.Messages.map(msg => ({
      id: msg.MessageId,
      body: msg.Body,
      receipt: msg.ReceiptHandle,
    }))

    for (let job of jobs) {
      const randomCrawlerNumber = Math.floor(Math.random() * crawlers.length)

      // synchronous get request
      const crawlerStatus = await getRequest(crawlers[randomCrawlerNumber])

      const deleteParams = {
        QueueUrl,
        ReceiptHandle: job.receipt,
      }
      if (crawlerStatus) {
        // asynchronous post request
        postRequest(crawlers[randomCrawlerNumber], job, randomCrawlerNumber)

        // delete queue
        await deleteJob(deleteParams)
      } else {
        // delete and requeue msg in order to do not get occurred in flight msgs
        await deleteJob(deleteParams)
        const sendParams = {
          MessageGroupId: 'crawling',
          MessageDeduplicationId: job.body.site + '-' + new Date().getTime(),
          QueueUrl,
          MessageBody: JSON.stringify(job.body),
          DelaySeconds: 0,
        }
        await sqs.sendMessage(sendParams).promise()
        console.log('> requeue job...')
      }
    }

    return corsSuccessResponse({
      done: true,
    })
  } catch (err) {
    console.log(err)
    return corsErrorResponse({
      done: false,
      err: err.name + ': ' + err.message,
    })
  }
}

export default runWarm(onBatchJobCreated)
