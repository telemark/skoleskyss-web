'use strict'

const getWaypoints = require('tfk-saksbehandling-skoleskyss-waypoints')
const config = require('../config')
const getNextForm = require('../lib/get-next-form')
const getSkipSteps = require('../lib/get-skip-steps')
const extractAdressToGeocode = require('../lib/extract-address-to-geocode')
const lookupSeeiendom = require('../lib/lookup-seeiendom')
const lookupDistance = require('../lib/lookup-distance')
const unwrapGeocoded = require('../lib/unwrap-geocoded')
const getSkoleFromId = require('../lib/get-skole-from-id')
const generateGrunnlagListe = require('../lib/generate-grunnlag-liste')
const generateLinjeListe = require('../lib/generate-studieretning-liste')
const prepareDataForSubmit = require('../lib/prepare-data-for-submit')
const checkPreviousApplications = require('../lib/check-previous-applications')
const checkDuplicateApplications = require('../lib/check-duplicate-applications')
const saveApplication = require('../lib/save-application')
const sendSMS = require('../lib/send-sms')
const logger = require('../lib/logger')
const pkg = require('../package.json')

module.exports.getNext = async (request, reply) => {
  const payload = request.payload
  const yar = request.yar
  const applicantId = yar.get('applicantId')
  if (payload) {
    logger('info', ['skjema', 'getNext', applicantId, 'payload'])
    let completedSteps = yar.get('completedSteps') || []
    completedSteps.push(payload.stepName)
    yar.set(payload.stepName, payload)
    if (payload.stepName === 'bosted' && payload.bosted === 'delt') {
      completedSteps.push('bosteddelt')
      const delt = yar.get('dsfDataDelt')
      yar.set('bosteddelt', Object.assign({stepName: 'bosteddelt'}, delt))
    }
    yar.set('completedSteps', completedSteps)
    const skipSteps = getSkipSteps(yar._store)
    skipSteps.forEach(function (item) {
      yar.set(item, false)
    })
  }

  const nextForm = getNextForm(yar._store)
  logger('info', ['skjema', 'getNext', applicantId, 'nextForm', nextForm])
  if (payload && payload.stepName === 'grunnlag') {
    logger('info', ['skjema', 'getNext', applicantId, 'grunnlag'])
    prepareDataForSubmit(request, async (error, document) => {
      logger('info', ['skjema', 'getNext', applicantId, 'prepare data for submit'])
      if (error) {
        logger('error', ['skjema', 'getNext', applicantId, 'prepare data for submit', error])
        reply(error)
      } else {
        // Is this a duplicate
        const duplicate = await checkDuplicateApplications(document)
        if (duplicate || yar.get('duplikatSoknad')) {
          logger('info', ['skjema', 'getNext', applicantId, 'this is a duplicate'])
          request.yar.set('duplikatSoknad', true)
          reply.redirect('/soknaduendret')
        } else {
          logger('info', ['skjema', 'getNext', applicantId, 'this is not a duplicate'])
          request.yar.set('duplikatSoknad', false)
          reply.redirect('/' + nextForm)
        }
      }
    })
  } else {
    reply.redirect('/' + nextForm)
  }
}

module.exports.getPreviousStep = (request, reply) => {
  const yar = request.yar
  const applicantId = yar.get('applicantId')
  let completedSteps = yar.get('completedSteps')
  logger('info', ['skjema', 'getPreviousStep', applicantId])
  if (completedSteps) {
    const previousStep = completedSteps.pop()
    yar.set('completedSteps', completedSteps)

    if (previousStep === 'skole') {
      logger('info', ['skjema', 'getPreviousStep', applicantId, 'previousStep', 'skole'])
      yar.clear('velgskole')
      yar.clear('velgklasse')
      yar.clear('skoleadresse')
    }

    if (previousStep === 'grunnlag') {
      logger('info', ['skjema', 'getPreviousStep', applicantId, 'previousStep', 'grunnlag'])
      yar.clear('grunnlag')
    }

    if (previousStep === 'bosted') {
      logger('info', ['skjema', 'getPreviousStep', applicantId, 'previousStep', 'bosted'])
      yar.clear('bosted')
      yar.clear('bosteddelt')
      yar.clear('bostedhybel')
    }

    if (previousStep === 'busskort') {
      logger('info', ['skjema', 'getPreviousStep', applicantId, 'previousStep', 'busskort'])
      yar.clear('busskort')
      yar.clear('busskortnummer')
    }

    reply.redirect('/' + previousStep)
  } else {
    reply.redirect('/')
  }
}

module.exports.showSeOver = async (request, reply) => {
  const yar = request.yar
  const applicantId = yar.get('applicantId')
  const logoutUrl = config.AUTH_URL_LOGOUT
  let viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl
  }
  logger('info', ['skjema', 'showSeOver', applicantId, 'start'])
  prepareDataForSubmit(request, async (error, document) => {
    if (error) {
      logger('error', ['skjema', 'showSeOver', applicantId, error])
    } else {
      viewOptions.document = document
      logger('info', ['skjema', 'showSeOver', applicantId, 'start'])
      reply.view('seover', viewOptions)
    }
  })
}

module.exports.showBosted = async (request, reply) => {
  const yar = request.yar
  const applicantId = yar.get('applicantId')
  const dsfData = yar.get('dsfData')
  const dsfDataDelt = yar.get('dsfDataDelt') || ''
  const logoutUrl = config.AUTH_URL_LOGOUT
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl,
    dsfData: dsfData,
    dsfDataDelt: dsfDataDelt
  }
  logger('info', ['skjema', 'showBosted', applicantId])
  const seeDsf = await lookupSeeiendom(extractAdressToGeocode(dsfData))
  yar.set('see-dsf', seeDsf)

  reply.view('bosted', viewOptions)
}

module.exports.showFeil = async (request, reply) => {
  const logoutUrl = config.AUTH_URL_LOGOUT
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl
  }

  reply.view('feil', viewOptions)
}

module.exports.showBostedHybel = async (request, reply) => {
  const logoutUrl = config.AUTH_URL_LOGOUT
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl
  }

  reply.view('bostedhybel', viewOptions)
}

module.exports.showBostedDelt = async (request, reply) => {
  const logoutUrl = config.AUTH_URL_LOGOUT
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl
  }

  reply.view('bosteddelt', viewOptions)
}

module.exports.showGrunnlag = async (request, reply) => {
  const yar = request.yar
  const logoutUrl = config.AUTH_URL_LOGOUT
  const grunnlagListe = generateGrunnlagListe(yar._store)
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    grunnlagListe: grunnlagListe,
    logoutUrl: logoutUrl
  }

  reply.view('grunnlag', viewOptions)
}

module.exports.showBusskort = async (request, reply) => {
  const logoutUrl = config.AUTH_URL_LOGOUT
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl
  }

  reply.view('busskort', viewOptions)
}

module.exports.showBusskortNummer = async (request, reply) => {
  const logoutUrl = config.AUTH_URL_LOGOUT
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl
  }

  reply.view('busskortnummer', viewOptions)
}

module.exports.showIkkeFunnet = async (request, reply) => {
  const logoutUrl = config.AUTH_URL_LOGOUT
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl
  }

  reply.view('ikkefunnet', viewOptions)
}

module.exports.showFailWhale = async (request, reply) => {
  const logoutUrl = config.AUTH_URL_LOGOUT
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl
  }

  reply.view('failwhale', viewOptions)
}

module.exports.showVelgSkole = async (request, reply) => {
  const yar = request.yar
  const logoutUrl = config.AUTH_URL_LOGOUT
  const applicantId = yar.get('applicantId')
  const hybel = yar.get('bostedhybel')
  const delt = yar.get('bosteddelt')
  const skoler = require('../lib/data/skoler.json')
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl,
    skoler: skoler
  }

  if (hybel || delt) {
    const key = hybel ? 'see-hybel' : 'see-delt'
    const data = hybel || delt
    const address = extractAdressToGeocode(data)
    logger('info', ['skjema', 'showVelgskole', 'applicantId', applicantId])
    const seeData = await lookupSeeiendom(address)
    yar.set(key, seeData)
  }

  reply.view('velgskole', viewOptions)
}

module.exports.showSkoleAdresse = async (request, reply) => {
  const logoutUrl = config.AUTH_URL_LOGOUT
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl
  }

  reply.view('skoleadresse', viewOptions)
}

module.exports.showVelgKlasse = async (request, reply) => {
  const yar = request.yar
  const applicantId = yar.get('applicantId')
  const logoutUrl = config.AUTH_URL_LOGOUT
  const valgtskole = yar.get('velgskole')
  const hybel = yar.get('bostedhybel')
  const delt = yar.get('bosteddelt')
  const dsf = yar.get('dsfData')

  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl
  }

  if (valgtskole.skole !== '0000') {
    logger('info', ['skjema', 'showVelgKlasse', applicantId, valgtskole.skole])
    const skole = getSkoleFromId(valgtskole.skole)
    const destination = unwrapGeocoded(skole)
    const store = yar._store
    const storeKeys = Object.keys(store).filter(key => /^see/.test(key))
    const distances = storeKeys.map(key => Object.assign({key: key}, yar.get(key))).map(distance => {
      let measure = {
        key: distance.key
      }
      let wp = {}
      measure.origin = unwrapGeocoded(distance)
      measure.destination = destination
      if (distance.key === 'see-dsf') {
        wp = dsf
      }
      if (distance.key === 'see-delt') {
        wp = delt
      }

      if (distance.key === 'see-hybel') {
        wp = hybel
      }

      wp.skole = valgtskole.skole
      const waypoints = getWaypoints(wp)

      if (waypoints.length > 0) {
        measure.waypoints = waypoints
      }

      return measure
    })
    console.log(distances)
    const jobs = distances.map(distance => lookupDistance(distance))
    const results = await Promise.all(jobs)
    distances.forEach((distance, index) => {
      const key = `distance-${distance.key}`
      logger('info', ['skjema', 'distances', applicantId, 'adds key', key])
      yar.set(key, results[index])
    })
    reply.view('velgklasse', viewOptions)
  } else {
    reply.view('velgklasse', viewOptions)
  }
}

module.exports.showVelgStudieretning = async (request, reply) => {
  const yar = request.yar
  const logoutUrl = config.AUTH_URL_LOGOUT
  const valgtskole = yar.get('velgskole')
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl,
    linjeListe: generateLinjeListe(valgtskole.skole)
  }

  reply.view('velgstudieretning', viewOptions)
}

module.exports.showSoktTidligere = async (request, reply) => {
  const logoutUrl = config.AUTH_URL_LOGOUT
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl
  }

  reply.view('sokttidligere', viewOptions)
}

module.exports.showSoknadUendret = async (request, reply) => {
  const logoutUrl = config.AUTH_URL_LOGOUT
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl
  }

  reply.view('soknaduendret', viewOptions)
}

module.exports.showKvittering = async (request, reply) => {
  const yar = request.yar
  const document = yar.get('submittedData')
  const logoutUrl = config.AUTH_URL_LOGOUT
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl,
    document: document
  }
  logger('info', ['skjema', 'showKvittering', document.applicantId])
  yar.reset()
  // request.cookieAuth.clear()
  reply.view('kvittering', viewOptions)
}

module.exports.doSubmit = async (request, reply) => {
  const yar = request.yar
  const applicantId = yar.get('applicantId')
  const korData = yar.get('korData')
  logger('info', ['skjema', 'doSubmit', applicantId])

  // Prepare data for submit
  prepareDataForSubmit(request, async (error, document) => {
    if (error) {
      logger('error', ['skjema', 'doSubmit', applicantId, 'prepare data for submit', error])
    } else {
      logger('info', ['skjema', 'doSubmit', applicantId, 'prepare data for submit', 'ready'])
      saveApplication(document)
        .then(async () => {
          logger('info', ['skjema', 'doSubmit', applicantId, 'submitted', 'success'])
          yar.set('submittedData', document)
          if (korData.MobilePhone !== '') {
            const msg = await sendSMS(korData.MobilePhone)
            logger('info', ['skjema', 'doSubmit', applicantId, 'sms', msg])
          } else {
            logger('info', ['skjema', 'doSubmit', applicantId, 'sms', 'no phonenumber'])
          }
          reply.redirect('/kvittering')
        }).catch(error => {
          logger('error', ['skjema', 'doSubmit', applicantId, error])
          yar.reset()
          request.cookieAuth.clear()
          reply.redirect('/feil')
        })
    }
  })
}

module.exports.showUriktigeOpplysninger = async (request, reply) => {
  const yar = request.yar
  const logoutUrl = config.AUTH_URL_LOGOUT
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl
  }

  yar.reset()
  request.cookieAuth.clear()

  reply.view('uriktigeopplysninger', viewOptions)
}

module.exports.showConfirm = async (request, reply) => {
  const yar = request.yar
  const korData = yar.get('korData')
  const logoutUrl = config.AUTH_URL_LOGOUT
  const viewOptions = {
    version: pkg.version,
    versionName: pkg.louie.versionName,
    versionVideoUrl: pkg.louie.versionVideoUrl,
    systemName: pkg.louie.systemName,
    githubUrl: pkg.repository.url,
    logoutUrl: logoutUrl,
    dsfData: yar.get('dsfData'),
    korData: korData
  }

  reply.view('confirm', viewOptions)
}

module.exports.checkConfirm = async (request, reply) => {
  const yar = request.yar
  const applicantId = yar.get('applicantId')
  const payload = request.payload
  if (payload.confirmed === 'ja') {
    logger('info', ['skjema', 'checkConfirm', applicantId, 'confirmed'])
    const completedSteps = yar.get('completedSteps') || []
    completedSteps.push('confirm')
    yar.set('completedSteps', completedSteps)
    // Is this the first application?
    const duplicate = await checkPreviousApplications(applicantId)
    if (duplicate || yar.get('tidligereSoknad')) {
      logger('info', ['skjema', 'checkConfirm', applicantId, 'isDuplicate'])
      request.yar.set('tidligereSoknad', true)
      reply.redirect('/sokttidligere')
    } else {
      reply.redirect('/next')
    }
  } else {
    logger('info', ['skjema', 'checkConfirm', applicantId, 'fresh applicant'])
    reply.redirect('/uriktigeopplysninger')
  }
}

module.exports.setupChanges = async (request, reply) => {
  const yar = request.yar
  const type = request.query.type

  if (type === 'skole') {
    yar.clear('velgskole')
    yar.clear('velgklasse')
    yar.clear('skoleadresse')
  }

  if (type === 'grunnlag') {
    yar.clear('grunnlag')
  }

  if (type === 'bosted') {
    yar.clear('bosted')
    yar.clear('bosteddelt')
    yar.clear('bostedhybel')
  }

  if (type === 'busskort') {
    yar.clear('busskort')
    yar.clear('busskortnummer')
  }

  reply.redirect('/next')
}
