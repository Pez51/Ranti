import pool from '../config/database.js';
import { requestOperation,readOperation,listOperations,decideOperation } from '../modules/operations/operation-request.service.js';
import { updateHandoff } from '../modules/operations/handoff.service.js';
import { AppError } from '../shared/errors/app-error.js';
import { readCalendar,saveCalendar } from '../modules/operations/calendar.service.js';
import { simulatePayment } from '../modules/operations/payment-simulation.service.js';

export const getCalendar=async(req,res,next)=>{try{res.set('Cache-Control','private, no-store').json(await readCalendar(pool,req.params.id,req.user.id));}catch(e){next(e);}};
export const setCalendar=async(req,res,next)=>{try{res.json(await saveCalendar(pool,req.params.id,req.user.id,req.body));}catch(e){next(e);}};
export const paySimulation=async(req,res,next)=>{try{res.json(await simulatePayment(pool,req.params.id,req.user.id,req.body));}catch(e){next(e);}};

export const coordinateHandoff=async(req,res,next)=>{
  try{res.json(await updateHandoff(pool,req.params.id,req.user.id,req.body));}catch(error){next(error);}
};

export const createOperation = async (req, res, next) => {
  try {
    const result = await requestOperation(pool,req.body, req.user.id);
    res.status(201).json(result);
  } catch (error) { next(error); }
};

export const listParticipantOperations = async (req, res, next) => {
  try {
    const result = await listOperations(pool,req.user.id,req.query);
    res.status(200).json(result);
  } catch (error) { next(error); }
};

export const getParticipantOperation = async (req, res, next) => {
  try {
    const result = await readOperation(pool,req.params.id, req.user.id);
    res.status(200).json(result);
  } catch (error) { next(error); }
};

export const acceptOperation = async (req, res, next) => {
  try {
    const result = await decideOperation(pool, req.params.id, req.user.id, { ...req.body, decision: 'accept' });
    res.status(200).json(result);
  } catch (error) { next(error); }
};

export const rejectOperation = async (req, res, next) => {
  try {
    const result = await decideOperation(pool, req.params.id, req.user.id, { ...req.body, decision: 'reject' });
    res.status(200).json(result);
  } catch (error) { next(error); }
};

export const cancelOperation = async (req, res, next) => {
  try {
    const result = await decideOperation(pool, req.params.id, req.user.id, { ...req.body, decision: 'cancel' });
    res.status(200).json(result);
  } catch (error) { next(error); }
};

export const confirmDelivery = async (req, res, next) => {
  try {
    throw new AppError({status:409,code:'PILOT_DELIVERY_FLOW',message:'En el piloto, coordina y confirma la entrega con ambos participantes desde Mis operaciones.'});
  } catch (error) { next(error); }
};
