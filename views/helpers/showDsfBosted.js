'use strict'

module.exports = dsfData => {
  let address = ''

  if (dsfData && dsfData.GARD) {
    address = 'Gårds og bruksnummer: ' + dsfData.KOMNR + '-' + parseInt(dsfData.GARD, 10) + '/' + parseInt(dsfData.BRUK, 10)
  } else if (dsfData) {
    address = dsfData.ADR + ', ' + dsfData.POSTN + ' ' + dsfData.POSTS
  }

  return address
}
