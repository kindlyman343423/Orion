/* eslint-disable no-useless-return */
/* eslint-disable no-shadow */
/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable consistent-return */
/* eslint-disable no-plusplus */
import cors from 'cors';
import dotenv from 'dotenv';
import express, { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import bearerToken from 'express-bearer-token';
import { expressjwt } from 'express-jwt';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';
import { apiVersion, defaultPort } from '@src/configs/server';
import routerV1 from '@src/routes/v1';
import registerAndEnrollAdmin from '@src/scripts/auth';
import logger from '@src/utils/logger';
import { publicPath, secret } from './constants/constant';
import { invoke } from './services/invoke';
import query from './services/query';

const isPublicPath = (req: Request) => {
  for (let i = 0; i < publicPath.length; i++) {
    if (req.originalUrl.indexOf(publicPath[i]) >= 0) return true;
  }

  return false;
};

const calculateInvokeResponseTime = async () => {
  const channelName = 'mychannel';
  const chaincodeName = 'orion';
  const fcn = 'AddMaintenanceHistory';
  const username = 'bengkel_bandung';
  const org = 'org3';

  const executionInvokeTimes = [];

  const invokeArgs = [
    ['8AW204022K0011340', 'Bagus1', 'Mantap', 'Ganti oli', 'Jakarta'],
    ['8AW204022K0011340', 'Bagus2', 'Mantap', 'Ganti oli', 'Jakarta'],
    ['8AW204022K0011340', 'Bagus3', 'Mantap', 'Ganti oli', 'Jakarta'],
    ['8AW204022K0011340', 'Bagus4', 'Mantap', 'Ganti oli', 'Jakarta'],
    ['8AW204022K0011340', 'Bagus5', 'Mantap', 'Ganti oli', 'Jakarta'],
    ['8AW204022K0011340', 'Bagus6', 'Mantap', 'Ganti oli', 'Jakarta'],
  ];
  for (let i = 0; i < invokeArgs.length; i++) {
    const start = performance.now();
    await invoke(channelName, chaincodeName, fcn, invokeArgs[i], username, org);
    const end = performance.now();
    executionInvokeTimes.push(end - start);
  }
  console.log(executionInvokeTimes);

  return;
};

const calculateQueryResponseTime = async () => {
  const channelName = 'mychannel';
  const chaincodeName = 'orion';
  const fcn = 'GetListMaintenanceHistoryByID';
  const args = ['8AW204022K0011340'];
  const username = 'bengkel_bandung';
  const org = 'org3';

  const executionQueryTimes = [];
  for (let i = 0; i < 6; i++) {
    const start = performance.now();
    await query(channelName, chaincodeName, args, fcn, username, org);
    const end = performance.now();
    console.log(end - start);
    executionQueryTimes.push(end - start);
  }
  console.log(executionQueryTimes);

  return;
};

const main = async () => {
  const app = express();
  const port: string = defaultPort || '3000';
  const versionURL: string = process.env.VERSION_URL || '/api/v1';

  // Proxy setup for production.
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
  else if (process.env.NODE_ENV === 'testingPerformanceInvoke') {
    await calculateInvokeResponseTime();
    return;
  } else if (process.env.NODE_ENV === 'testingPerformanceQuery') {
    await calculateQueryResponseTime();
    return;
  }

  // Service init and global middlewares.
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(cors({ credentials: true, origin: true }));

  // Authentication.
  app.use(
    expressjwt({
      secret,
      algorithms: ['RS256', 'HS256', 'none'],
    }).unless({
      path: publicPath,
    })
  );
  app.use(bearerToken());
  app.use((req: any, res: Response, next: NextFunction) => {
    if (isPublicPath(req)) return next();

    const { token } = req;
    if (!token)
      return res.send({
        success: false,
        message: 'auth failed, please provide token',
      });

    jwt.verify(token, secret, (err: any, decoded: any) => {
      if (err) {
        res.send({
          success: false,
          message: 'auth failed',
        });
      } else {
        req.username = decoded.username;
        req.org = decoded.org;
        req.role = decoded.role;

        return next();
      }
    });
  });

  // Service routing.
  app.use(versionURL, routerV1);
  app.use((_req: Request, res: Response) => {
    return res.status(StatusCodes.NOT_FOUND).json({
      apiVersion,
      error: { code: StatusCodes.NOT_FOUND, message: ReasonPhrases.NOT_FOUND },
    });
  });
  app.use((err: ErrorRequestHandler, req: Request, res: Response) => {
    logger.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      apiVersion,
      error: {
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        message: ReasonPhrases.INTERNAL_SERVER_ERROR,
      },
    });
  });

  if (process.env.REGISTER_AND_ENROLL_ADMIN === 'true') {
    await registerAndEnrollAdmin();
    logger.info(
      'success register and enroll admin, please change the flag to false and run again to start the server'
    );

    return;
  }

  // Starting service.
  app.listen(port, () => logger.info(`Service running on port ${port}`));
};

// Setup config.
const cfg = dotenv.config();
if (cfg.error) {
  logger.error(cfg.error);
  process.exit(1);
}

// Start main service.
main();
