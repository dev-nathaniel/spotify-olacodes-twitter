import Head from 'next/head'
import Image from 'next/image'
import { AiFillFastBackward, AiFillFastForward } from 'react-icons/ai'
import { BsArrowUpRight } from 'react-icons/bs'
import { IoIosPause, IoIosPlay } from 'react-icons/io'
import { HiOutlineChevronDown, HiOutlineChevronUp } from 'react-icons/hi'
import styles from '../styles/Home.module.css'
import { useState, useEffect, useCallback, useRef, ReactElement } from 'react'
import Router from 'next/router'
import axios from 'axios'
import Airtable from 'airtable'

export default function Home() {
  const [active, setActive] = useState(true)
  const [track, setTrack] = useState({
    songName: '',
    isPlaying: true,
    artistName: '',
    url: '',
    coverImageUrl: '',
    previewUrl: ''
  })
  const [found, setFound] = useState(false)
  const [index, setIndex] = useState(0)
  const [played, setPlayed] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)
  const [recentTracks, setRecentTracks] = useState<any>([])
  const date = new Date()
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  
  const drop = () => {
    setActive(!active)
  }

  Airtable.configure({
    endpointUrl: "https://api.airtable.com",
    apiKey: process.env.NEXT_PUBLIC_AIRTABLE_API
  })

  const base = Airtable.base(String(process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID))

  const getNewToken = useCallback(async () => {
    const grant_type = 'refresh_token'
    const refresh_token = process.env.NEXT_PUBLIC_REFRESH_TOKEN
    const encodedSecret = Buffer.from(process.env.NEXT_PUBLIC_CLIENT_ID + ":" + process.env.NEXT_PUBLIC_CLIENT_SECRET).toString("base64")
    try {
      const res = await axios.post(
        'https://accounts.spotify.com/api/token',
        {
          grant_type,
          refresh_token
        },
        {
          headers: {
            'Authorization': 'Basic ' + encodedSecret,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      )

      return res.data
    } catch (err: any) {
      console.log(err)

      throw new Error(err)
    }
  }, [])

  const updateAirtableToken = useCallback(async () => {
    // get new token from Spotify

    const res = await getNewToken();

    // Spotify tokens expire after 1 hour. We convert the expiry time to milliseconds and take 300000ms off to account for any latency.
    const created = Date.now();
    const token = {
      Token: res.access_token,
      Expiry: (res.expires_in - 300) * 1000,
      Created: created,
    };

    // console.log(token.Expiry)
    // console.log(token.Created)


    // update Airtable
    await base("Access Tokens").update([
      {
        id: "recaBemOM2helWOTg",
        fields: {
          ...token,
        },
      },
    ]);
  }, [])

  const getRecentlyPlayed = useCallback(async (token: any) => {
    const headers = {
      Authorization: `Bearer ${token.Token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
    try {
      const res = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', { headers })

      if (
        res.data.is_playing === false ||
        res.data.currently_playing_type !== 'track'
      ) {
        const res = await axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=1', { headers })
        const history = res.data.items
        const recentTrack = history[0].track

        setTrack({
          songName: recentTrack.name,
          isPlaying: false,
          artistName: recentTrack.artists[0].name,
          url: recentTrack.external_urls.spotify,
          coverImageUrl: recentTrack.album.images[0].url,
          previewUrl: recentTrack.preview_url
        })
      } else {
        const playingTrack = res.data.item
        setTrack({
          songName: playingTrack.name,
          isPlaying: res.data.is_playing,
          artistName: playingTrack.artists[0].name,
          url: playingTrack.external_urls.spotify,
          coverImageUrl: playingTrack.album.images[0].url,
          previewUrl: playingTrack.preview_url
        })
      }
    } catch (err) {
      console.log(err)
    }
  }, [])

  const getRecentSongs = useCallback(async (token: any) => {
    const headers = {
      Authorization: `Bearer ${token.Token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
    try {
      const res = await axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=15', { headers })
      const history = res.data.items

      history.map((item: any, index: number) => {
        const track = item.track
        recentTracks.push({
          songName: track.name,
          isPlaying: false,
          artistName: track.artists[0].name,
          url: track.external_urls.spotify,
          coverImageUrl: track.album.images[0].url,
          previewUrl: track.preview_url
        })

      })
    } catch (err) {
      console.log(err)
    }
  }, [])

  const initiate = useCallback(async () => {
    try {
      const isTokenValid = async (token: any) => {
        const now = Date.now()
        if (!token.Created || !token.Expiry) {
          await updateAirtableToken()
          const expiry = Number(token.Created) + Number(token.Expiry)
          return now < expiry
        } else {
          const expiry = Number(token.Created) + Number(token.Expiry)
          return now < expiry
        }

      }

      const res = await base('Access Tokens').select().firstPage()
      const token = res[1].fields
      const valid = await isTokenValid(token)
      if ((token && !valid) || (!token)) {
        await updateAirtableToken()
        initiate()
      } else {
        await getRecentSongs(token)
        console.log('test')
      
        await getRecentlyPlayed(token)
      }
    } catch (err: any) {
      console.log(err)
      if (err.response) {
        if (err.response.data.error.message === 'The access token expired') {
          await initiate()
        }
      }
    }
  }, [])

  useEffect(() => {
    initiate()
  }, [initiate])


  // const code = 'AQANAtEaHz7DNiUX4458zOVPm5d-q-27rG-K-AEV1m3qwP_DRPbPzTQS03_vY8ozvuaa4tcBIV2OtSDFXe9g6dS9Vwnex6FCc3kJr-MKx6wHeudEeJaN_YDbm1b4ZQpTpdpJHgv6jebDkeUdx60eVoqMPXg71mWbbhtG1ngvL75ySP9cFmEXRWfWW2LDQ1TAI_LWgFQGf3ybQhTawMEt2w_R_faN2zxGjtHw5EN4cBrEUu2du91zyq9zE2WKJi-FJeCzIpbojv0a8oxcgu5pFqZAls4BOqCsdNS1VK5GMG12U3VyT-4SBV5cuNx-d2XuyKMdZAH5VGbW6CtxCjq0OCJdUmW5h1pIso4b1m8_FjIcmjpCEz-h4-bfRA6RzM7sNvhjlTslqwiX2CMoBa1vR64OfhaElNQUTeAVdACg7KLkH30wxs8WbIbwejRm6AS_YoWot04q129DAbc4kbd6dQkMQBkP4arguGyQ4iNbnLSPQNRgdCCSbnm6Frg7pYnxe5UMPGSFW2ksrwoGdf9Ozq_KUhD_nnkayQ2o_k_IBmeG0VzMTbYHB1E7Lj4j1Hj8LYxMH3lX1gtYqaMU18K5k3QKZFrg1mIPR-9m5c8K2POmiX4jYibvmDM6It29FuaG1kNhygtRQz1hHeJl-eYStQJ8ir0jppF-wucm4DxhXeYjqiOw_jNN3-4Sf575ROSJNzU'
  // const redirect_uri = 'http://localhost:3000/callback'

  // useEffect(()=> {
  //   const getAccessToken = async () => {
  //   try {
  //   const res = await axios.post('https://accounts.spotify.com/api/token', 
  //     {
  //       code,
  //       redirect_uri, 
  //       grant_type: 'authorization_code'
  //     }, 
  //     {
  //       headers: {
  //         'Authorization': 'Basic ' + Buffer.from(process.env.NEXT_PUBLIC_CLIENT_ID + ":" + process.env.NEXT_PUBLIC_CLIENT_SECRET).toString("base64"),
  //         'Content-Type': 'application/x-www-form-urlencoded'
  //       }
  //     }
  //   )

  //   console.log(res.data)
  //   } catch (err: any) {
  //     console.log(err.response)
  //   }

  // }

  // getAccessToken()
  // }, [])
  // const scope = 'user-read-playback-state user-modify-playback-state user-read-currently-playing app-remote-control streaming playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-follow-modify user-follow-read user-read-playback-position user-top-read user-read-recently-played user-library-modify user-library-read user-read-email user-read-private'

  // useEffect(()=> {
  // const {pathname} = Router

  //   if (pathname == '/') {
  //   Router.push(`https://accounts.spotify.com/authorize?response_type=code&client_id=${process.env.NEXT_PUBLIC_CLIENT_ID}&scope=${scope}&redirect_uri=${redirect_uri}`)
  //   }
  // }, [])

  // console.log(track.previewUrl)
  const playPreview = () => {
    const audioElement = audio.current

    if (audioElement?.paused) {
      setPlayed(true)
      audioElement.play()
    } else {
      setPlayed(false)
      audioElement?.pause()
    }
  }

  audio.current?.addEventListener('ended', () => {
    setPlayed(false)
  })
  const changeSong = (direction: String) => {
    if (found == false) {
    const trackIndex = recentTracks.findIndex((x: any) => {
      return x.songName === track.songName
    })
    setFound(true)
    setIndex(trackIndex)
    }
    if (direction == 'next') {
      if (index == recentTracks.length -1) {
        setTrack(recentTracks[0])
        setIndex(0)
      } else {
      setTrack(recentTracks[index + 1])
      setIndex(index + 1)
      }
    } else {
      if (index == 0) {
        setTrack(recentTracks[recentTracks.length - 1])
        setIndex(recentTracks.length - 1)
      } else {
      setTrack(recentTracks[index-1])
      setIndex(index -1)
      }
    }
    setPlayed(false)
    audio.current?.load()
  }
  

  const selectSong = (chosenTrack: any, chosenIndex: any) => {
    setTrack(chosenTrack)
    setIndex(chosenIndex)
    setPlayed(false)
    audio.current?.load()    
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>Create Next App</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      {track.previewUrl && <audio ref={audio} style={{zIndex: 200}}>
        <source src={track.previewUrl} />
      </audio>}
        <p className={styles.status}>{track.isPlaying ? 'Currently Playing' : 'Previously Played'}</p>
      <div className={styles.bg}>
        <img src={track.coverImageUrl} />
      </div>
      <div className={styles.blur}></div>
      <main className={styles.main}>

        <div className={styles.left}>
          <div className={styles.leftTop}>
            <p>{days[date.getDay()]} {date.getDate()}/{months[date.getMonth()]}</p>
            <a href={track.url} target='_blank'>
            <div>
              <BsArrowUpRight color='black' />
            </div>
            </a>
          </div>
          <div className={styles.currentSong}>
            <div className={styles.previewImg}>
              <img src={track.coverImageUrl} />
            </div>
            <p>{track.artistName} - {track.songName}</p>
            <div className={styles.controls}>
              <AiFillFastBackward onClick={() => changeSong('back')} style={{ cursor: 'pointer' }} />
              <div></div>
              {!played ? <IoIosPlay onClick={playPreview} style={{ cursor: 'pointer' }} /> : <IoIosPause onClick={playPreview} style={{ cursor: 'pointer'}} />}
              <div></div>
              <AiFillFastForward onClick={() => changeSong('next')} style={{ cursor: 'pointer' }} />
            </div>
          </div>
        </div>
        <div style={{ height: active ? '100%' : '', }} className={styles.right}>
          <div onClick={drop} style={{ marginBottom: active ? '0px' : '0px' }} className={styles.dropDown}>
            <p>Songs</p>
            {active ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
          </div>
          {active ? <div className={styles.dropDownList}>
            {recentTracks.length > 0 && recentTracks.map((track: any, index: any)=> (
              <p onClick={()=> selectSong(track, index)} key={`${index}${track.songName}`}>{index + 1}. {track.songName} - {track.artistName}</p>
            ))}
            {/* <p>Rapid Fire - Cruel Santino</p>
            <p>Go Away - Fireboy DML</p>
            <p>Starlight - Dave</p>
            <p>As it Was - Harry Style</p>
            <p>Bandana - Fireboy Dml</p>
            <p>Frozen - Madonna</p>
            <p>Dandelions - Ruth B</p>
            <p>Dandelions - Ruth B</p>
            <p>Dandelions - Ruth B</p>
            <p>Dandelions - Ruth B</p>
            <p>Dandelions - Ruth B</p>
            <p>Dandelions - Ruth B</p>
            <p>Dandelions - Ruth B</p> */}
          </div>
            : null}
        </div>
      </main >


    </div >
  )
}
