# Setting the base to nodejs 8.11.1
FROM node:8.11.1-alpine@sha256:dcee83ad53ab1d2754ca7029a06aa1f2c79bf3ee08b1a40bb052443efacd3b8f

#### Begin setup ####

# Installs git
RUN apk add --update --no-cache git

# Extra tools for native dependencies
RUN apk add --no-cache make gcc g++ python tzdata

# Timezone
ENV TIMEZONE Europe/Oslo
RUN cp /usr/share/zoneinfo/${TIMEZONE} /etc/localtime
RUN echo "${TIMEZONE}" > /etc/timezone

# Bundle app source
COPY . /src

# Change working directory
WORKDIR "/src"

# Install dependencies
RUN npm install --production

# Expose 8000
EXPOSE 8000

# Startup
ENTRYPOINT node standalone.js
